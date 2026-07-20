# app/routers/pieces.py — Pièces de la maison (ANNEXE V4)
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, pieces, taches, tache_pieces, utilisateurs
from app.dependencies import get_current_user, get_role_in_maison, require_gestion, require_membre
from app.models.schemas import PieceAffecterInput, PieceCreateInput, PieceUpdateInput
from app.services.notifications import notifier
from app.utils.formatting import mini_user

router = APIRouter(tags=["pieces"])

VALID_TYPES = {"chambre", "salon", "cuisine", "salle_de_bain", "bureau", "garage", "autre"}


async def _notifier_affectation(
    piece_id: int, maison_id: int, nom_piece: str, affecte_a, acteur_id: int
) -> None:
    """ANNEXE V8 — prévient le SEUL intéressé qu'une pièce lui est confiée.

    Le reste du foyer n'a pas besoin de savoir qui range le garage ; l'intéressé,
    si : on vient de lui donner une responsabilité. `exclure` couvre le cas du
    gestionnaire qui s'affecte une pièce à lui-même (il le sait déjà).
    Une DÉSaffectation (`affecte_a` à None) ne notifie pas : on annonce une
    responsabilité, pas son retrait.
    """
    if affecte_a is None:
        return
    await notifier(
        [affecte_a],
        type="piece",
        titre="🚪 Une pièce t'est confiée",
        message=f"Tu es responsable de « {nom_piece} »",
        maison_id=maison_id,
        lien=f"piece:{piece_id}",
        exclure=acteur_id,
    )


async def _get_piece_or_404(piece_id: int) -> dict:
    row = await database.fetch_one(pieces.select().where(pieces.c.id == piece_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pièce introuvable")
    return dict(row)


async def _serialize(row: dict) -> dict:
    data = dict(row)
    affecte = None
    if data.get("affecte_a"):
        u = await database.fetch_one(
            "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": data["affecte_a"]}
        )
        affecte = mini_user(u) if u else None
    # `membre_affecte` (nom historique) + `membre` (alias lu par l'app mobile).
    data["membre_affecte"] = affecte
    data["membre"] = affecte
    return data


@router.get("/maisons/{maison_id}/pieces")
async def list_pieces(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        pieces.select()
        .where(pieces.c.maison_id == maison_id)
        .order_by(pieces.c.date_creation.asc())
        .limit(limit)
        .offset(offset)
    )
    return [await _serialize(dict(r)) for r in rows]


@router.post("/maisons/{maison_id}/pieces", status_code=status.HTTP_201_CREATED)
async def create_piece(
    maison_id: int, data: PieceCreateInput, current_user: dict = Depends(get_current_user)
):
    """Création réservée à la gestion (chef/co-chef/chef temporaire)."""
    await require_gestion(maison_id, current_user["id"])

    type_ = data.type or "autre"
    if type_ not in VALID_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de pièce invalide")

    affecte_a = data.affecte_a
    if affecte_a is not None:
        role = await get_role_in_maison(maison_id, affecte_a)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le membre affecté doit être membre de la maison",
            )

    piece_id = await database.execute(
        pieces.insert().values(maison_id=maison_id, nom=data.nom, type=type_, affecte_a=affecte_a)
    )
    # Une pièce peut naître déjà affectée : c'est le même événement.
    await _notifier_affectation(piece_id, maison_id, data.nom, affecte_a, current_user["id"])
    return await _serialize(await _get_piece_or_404(piece_id))


@router.put("/pieces/{piece_id}")
async def update_piece(
    piece_id: int, data: PieceUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_piece_or_404(piece_id)
    await require_gestion(row["maison_id"], current_user["id"])

    fournis = data.model_dump(exclude_unset=True)
    values = {}
    if data.nom is not None:
        values["nom"] = data.nom
    if data.type is not None:
        if data.type not in VALID_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de pièce invalide")
        values["type"] = data.type
    # `affecte_a` fourni : peut être un membre (à valider) OU null (désaffecter).
    if "affecte_a" in fournis:
        if data.affecte_a is not None:
            role = await get_role_in_maison(row["maison_id"], data.affecte_a)
            if role is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Le membre affecté doit être membre de la maison",
                )
        values["affecte_a"] = data.affecte_a

    if values:
        await database.execute(pieces.update().where(pieces.c.id == piece_id).values(**values))

    # Uniquement sur un VRAI changement d'affectation : un PUT qui renvoie le
    # même `affecte_a` (édition du nom, par ex.) ne doit pas re-notifier.
    if "affecte_a" in fournis and data.affecte_a != row["affecte_a"]:
        await _notifier_affectation(
            piece_id,
            row["maison_id"],
            values.get("nom", row["nom"]),
            data.affecte_a,
            current_user["id"],
        )

    return await _serialize(await _get_piece_or_404(piece_id))


@router.delete("/pieces/{piece_id}")
async def delete_piece(piece_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_piece_or_404(piece_id)
    await require_gestion(row["maison_id"], current_user["id"])

    # Détache les tâches liées à cette pièce (ne les supprime pas) : colonne
    # legacy `piece_id` remise à NULL + retrait des associations multi-pièces.
    async with database.transaction():
        await database.execute(taches.update().where(taches.c.piece_id == piece_id).values(piece_id=None))
        await database.execute(tache_pieces.delete().where(tache_pieces.c.piece_id == piece_id))
        await database.execute(pieces.delete().where(pieces.c.id == piece_id))
    return {"message": "Pièce supprimée"}


@router.post("/pieces/{piece_id}/affecter")
async def affecter_piece(
    piece_id: int, data: PieceAffecterInput, current_user: dict = Depends(get_current_user)
):
    """Affecte (ou désaffecte, si utilisateur_id est null) un membre à la pièce."""
    row = await _get_piece_or_404(piece_id)
    await require_gestion(row["maison_id"], current_user["id"])

    if data.utilisateur_id is not None:
        role = await get_role_in_maison(row["maison_id"], data.utilisateur_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le membre affecté doit être membre de la maison",
            )

    await database.execute(
        pieces.update().where(pieces.c.id == piece_id).values(affecte_a=data.utilisateur_id)
    )

    if data.utilisateur_id != row["affecte_a"]:
        await _notifier_affectation(
            piece_id, row["maison_id"], row["nom"], data.utilisateur_id, current_user["id"]
        )

    return await _serialize(await _get_piece_or_404(piece_id))
