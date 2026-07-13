# app/routers/boutique.py — Boutique de récompenses (ANNEXE V3)
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import (
    boutique_recompenses,
    database,
    membres_maison,
    points_log,
    recompense_echanges,
)
from app.dependencies import (
    get_current_user,
    require_gestion,
    require_membre,
    require_not_enfant,
    require_not_visiteur,
)
from app.models.schemas import BoutiqueCreateInput, BoutiqueUpdateInput
from app.services.notifications import notifier
from app.services.points import ajuster_points

router = APIRouter(tags=["boutique"])


def _serialize_recompense(row) -> dict:
    data = dict(row)
    data["actif"] = bool(data.get("actif"))
    return data


def _serialize_echange(row) -> dict:
    return dict(row)


async def _get_recompense_or_404(recompense_id: int) -> dict:
    row = await database.fetch_one(
        boutique_recompenses.select().where(boutique_recompenses.c.id == recompense_id)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Récompense introuvable")
    return dict(row)


async def _get_echange_or_404(echange_id: int) -> dict:
    row = await database.fetch_one(
        recompense_echanges.select().where(recompense_echanges.c.id == echange_id)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Échange introuvable")
    return dict(row)


# ==================== Catalogue ====================

@router.get("/maisons/{maison_id}/boutique")
async def list_boutique(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        boutique_recompenses.select()
        .where(boutique_recompenses.c.maison_id == maison_id)
        .order_by(boutique_recompenses.c.cout_points.asc())
        .limit(limit)
        .offset(offset)
    )
    return [_serialize_recompense(r) for r in rows]


@router.post("/maisons/{maison_id}/boutique", status_code=status.HTTP_201_CREATED)
async def create_boutique(
    maison_id: int, data: BoutiqueCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_gestion(maison_id, current_user["id"])
    recompense_id = await database.execute(
        boutique_recompenses.insert().values(
            maison_id=maison_id,
            nom=data.nom,
            cout_points=data.cout_points,
            description=data.description,
            actif=bool(data.actif) if data.actif is not None else True,
        )
    )
    return _serialize_recompense(await _get_recompense_or_404(recompense_id))


@router.put("/boutique/{recompense_id}")
async def update_boutique(
    recompense_id: int, data: BoutiqueUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_recompense_or_404(recompense_id)
    await require_gestion(row["maison_id"], current_user["id"])

    values = {}
    if data.nom is not None:
        values["nom"] = data.nom
    if data.cout_points is not None:
        values["cout_points"] = data.cout_points
    if data.description is not None:
        values["description"] = data.description
    if data.actif is not None:
        values["actif"] = bool(data.actif)

    if values:
        await database.execute(
            boutique_recompenses.update().where(boutique_recompenses.c.id == recompense_id).values(**values)
        )

    return _serialize_recompense(await _get_recompense_or_404(recompense_id))


@router.delete("/boutique/{recompense_id}")
async def delete_boutique(recompense_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_recompense_or_404(recompense_id)
    await require_gestion(row["maison_id"], current_user["id"])
    async with database.transaction():
        await database.execute(recompense_echanges.delete().where(recompense_echanges.c.recompense_id == recompense_id))
        await database.execute(boutique_recompenses.delete().where(boutique_recompenses.c.id == recompense_id))
    return {"message": "Récompense supprimée"}


# ==================== Échanges ====================

@router.post("/boutique/{recompense_id}/echanger", status_code=status.HTTP_201_CREATED)
async def echanger(recompense_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_recompense_or_404(recompense_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas échanger de récompense")

    cout = row["cout_points"]

    # Débit atomique : le décrément n'a lieu que si le solde est suffisant, dans
    # la même requête (WHERE points >= :cout). Supprime le TOCTOU « lire → tester
    # → débiter » qui autorisait un double-échange concurrent / solde négatif.
    # RETURNING est supporté par Postgres et SQLite ≥ 3.35 (nos cibles).
    async with database.transaction():
        updated = await database.fetch_one(
            """
            UPDATE membres_maison SET points = points - :cout
            WHERE maison_id = :mid AND utilisateur_id = :uid AND points >= :cout
            RETURNING points
            """,
            values={"cout": cout, "mid": row["maison_id"], "uid": current_user["id"]},
        )
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points insuffisants",
            )
        # Journalise le débit (ajuster_points est court-circuité ici pour garder
        # le décrément conditionnel atomique).
        await database.execute(
            points_log.insert().values(
                maison_id=row["maison_id"],
                utilisateur_id=current_user["id"],
                delta=-cout,
                motif=f"boutique:echange:{recompense_id}",
            )
        )
        echange_id = await database.execute(
            recompense_echanges.insert().values(
                recompense_id=recompense_id,
                maison_id=row["maison_id"],
                utilisateur_id=current_user["id"],
                cout=cout,
                statut="demande",
            )
        )

    gestion_rows = await database.fetch_all(
        "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid AND role IN ('chef','co_chef')",
        values={"mid": row["maison_id"]},
    )
    await notifier(
        [g["utilisateur_id"] for g in gestion_rows],
        type="boutique",
        titre="🎁 Échange demandé",
        message=f"{current_user['nom']} veut échanger « {row['nom']} »",
        maison_id=row["maison_id"],
        lien="boutique",
    )

    return _serialize_echange(await _get_echange_or_404(echange_id))


@router.get("/maisons/{maison_id}/echanges")
async def list_echanges(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        """
        SELECT e.*, r.nom AS recompense_nom, u.nom AS utilisateur_nom
        FROM recompense_echanges e
        JOIN boutique_recompenses r ON r.id = e.recompense_id
        JOIN utilisateurs u ON u.id = e.utilisateur_id
        WHERE e.maison_id = :mid
        ORDER BY e.date_creation DESC
        LIMIT :limit OFFSET :offset
        """,
        values={"mid": maison_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows]


@router.post("/echanges/{echange_id}/valider")
async def valider_echange(echange_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_echange_or_404(echange_id)
    # Gestion (chef/co-chef) requise, et jamais un compte enfant (validation de récompense).
    await require_gestion(row["maison_id"], current_user["id"])
    await require_not_enfant(
        row["maison_id"], current_user["id"], "Un compte enfant ne peut pas valider de récompense"
    )

    # Transition d'état idempotente : seule une demande encore « demande » passe
    # à « valide » (empêche le double-traitement concurrent).
    updated = await database.fetch_one(
        """
        UPDATE recompense_echanges SET statut = 'valide'
        WHERE id = :id AND statut = 'demande'
        RETURNING id
        """,
        values={"id": echange_id},
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cet échange a déjà été traité")

    await notifier(
        [row["utilisateur_id"]],
        type="boutique",
        titre="✅ Échange validé",
        message="Ta récompense a été validée !",
        maison_id=row["maison_id"],
        lien="boutique",
    )
    return _serialize_echange(await _get_echange_or_404(echange_id))


@router.post("/echanges/{echange_id}/refuser")
async def refuser_echange(echange_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_echange_or_404(echange_id)
    await require_gestion(row["maison_id"], current_user["id"])
    await require_not_enfant(
        row["maison_id"], current_user["id"], "Un compte enfant ne peut pas valider de récompense"
    )

    # Refus idempotent + recrédit, dans une transaction : on ne recrédite que si
    # l'échange était bien « demande » (évite un double-remboursement).
    async with database.transaction():
        updated = await database.fetch_one(
            """
            UPDATE recompense_echanges SET statut = 'refuse'
            WHERE id = :id AND statut = 'demande'
            RETURNING id
            """,
            values={"id": echange_id},
        )
        if updated is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cet échange a déjà été traité")
        # Recrédite les points déduits lors de la demande.
        await ajuster_points(
            row["maison_id"], [row["utilisateur_id"]], row["cout"], motif=f"boutique:refus:{echange_id}"
        )
    await notifier(
        [row["utilisateur_id"]],
        type="boutique",
        titre="❌ Échange refusé",
        message="Tes points ont été recrédités.",
        maison_id=row["maison_id"],
        lien="boutique",
    )
    return _serialize_echange(await _get_echange_or_404(echange_id))
