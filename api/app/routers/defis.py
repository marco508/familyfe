# app/routers/defis.py — Défis de maison (ANNEXE V3)
from fastapi import APIRouter, Depends, HTTPException, status

from app.database.database import database, defi_participants, defis
from app.dependencies import get_current_user, require_gestion, require_membre, require_not_visiteur
from app.models.schemas import DefiCreateInput
from app.services.notifications import notifier_maison
from app.services.points import ajuster_points

router = APIRouter(tags=["defis"])


async def _get_defi_or_404(defi_id: int) -> dict:
    row = await database.fetch_one(defis.select().where(defis.c.id == defi_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Défi introuvable")
    return dict(row)


async def _participants_for(defi_id: int) -> list:
    rows = await database.fetch_all(
        """
        SELECT dp.utilisateur_id, dp.termine, u.nom, u.image
        FROM defi_participants dp
        JOIN utilisateurs u ON u.id = dp.utilisateur_id
        WHERE dp.defi_id = :did
        """,
        values={"did": defi_id},
    )
    return [
        {
            "utilisateur_id": r["utilisateur_id"],
            "nom": r["nom"],
            "image": r["image"],
            "termine": bool(r["termine"]),
        }
        for r in rows
    ]


async def _serialize(row: dict, current_user_id: int) -> dict:
    data = dict(row)
    participants = await _participants_for(row["id"])
    data["participants"] = participants
    mon_etat = next((p for p in participants if p["utilisateur_id"] == current_user_id), None)
    data["mon_etat"] = mon_etat
    data["je_participe"] = mon_etat is not None
    data["mon_termine"] = bool(mon_etat["termine"]) if mon_etat else False
    return data


@router.get("/maisons/{maison_id}/defis")
async def list_defis(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        defis.select().where(defis.c.maison_id == maison_id).order_by(defis.c.date_creation.desc())
    )
    return [await _serialize(dict(r), current_user["id"]) for r in rows]


@router.post("/maisons/{maison_id}/defis", status_code=status.HTTP_201_CREATED)
async def create_defi(maison_id: int, data: DefiCreateInput, current_user: dict = Depends(get_current_user)):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer de défi")
    defi_id = await database.execute(
        defis.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            description=data.description,
            points=data.points,
            date_fin=data.date_fin,
            statut="ouvert",
            createur_id=current_user["id"],
        )
    )
    await notifier_maison(
        maison_id,
        type="defi",
        titre="🏆 Nouveau défi",
        message=f"« {data.titre} » — rejoins-le !",
        lien="defis",
        exclure=current_user["id"],
    )
    return await _serialize(await _get_defi_or_404(defi_id), current_user["id"])


@router.post("/defis/{defi_id}/rejoindre")
async def rejoindre_defi(defi_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_defi_or_404(defi_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas rejoindre de défi")
    if row["statut"] != "ouvert":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce défi est clos")

    existing = await database.fetch_one(
        defi_participants.select().where(
            (defi_participants.c.defi_id == defi_id)
            & (defi_participants.c.utilisateur_id == current_user["id"])
        )
    )
    if not existing:
        await database.execute(
            defi_participants.insert().values(
                defi_id=defi_id, utilisateur_id=current_user["id"], termine=False
            )
        )
    return await _serialize(await _get_defi_or_404(defi_id), current_user["id"])


@router.post("/defis/{defi_id}/terminer")
async def terminer_defi(defi_id: int, current_user: dict = Depends(get_current_user)):
    """Le participant marque le défi comme fait pour lui → +points (une seule fois)."""
    row = await _get_defi_or_404(defi_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas terminer de défi")
    if row["statut"] != "ouvert":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce défi est clos")

    participant = await database.fetch_one(
        defi_participants.select().where(
            (defi_participants.c.defi_id == defi_id)
            & (defi_participants.c.utilisateur_id == current_user["id"])
        )
    )
    deja_termine = bool(participant["termine"]) if participant else False

    if not participant:
        await database.execute(
            defi_participants.insert().values(
                defi_id=defi_id, utilisateur_id=current_user["id"], termine=True
            )
        )
    elif not deja_termine:
        await database.execute(
            defi_participants.update().where(defi_participants.c.id == participant["id"]).values(termine=True)
        )

    if not deja_termine:
        await ajuster_points(
            row["maison_id"], [current_user["id"]], int(row["points"] or 0), motif=f"defi:termine:{defi_id}"
        )

    return await _serialize(await _get_defi_or_404(defi_id), current_user["id"])


@router.post("/defis/{defi_id}/cloturer")
async def cloturer_defi(defi_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_defi_or_404(defi_id)
    await require_gestion(row["maison_id"], current_user["id"])
    await database.execute(defis.update().where(defis.c.id == defi_id).values(statut="clos"))
    return await _serialize(await _get_defi_or_404(defi_id), current_user["id"])


@router.delete("/defis/{defi_id}")
async def delete_defi(defi_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_defi_or_404(defi_id)
    role = await require_membre(row["maison_id"], current_user["id"])
    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut supprimer ce défi",
        )
    await database.execute(defi_participants.delete().where(defi_participants.c.defi_id == defi_id))
    await database.execute(defis.delete().where(defis.c.id == defi_id))
    return {"message": "Défi supprimé"}
