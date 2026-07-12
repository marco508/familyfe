# app/routers/chat.py — Chat de maison + commentaires d'activité (ANNEXE V3)
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import activite_commentaires, activites, database, messages
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import CommentaireCreateInput, MessageCreateInput
from app.services.notifications import notifier
from app.utils.formatting import mini_user

router = APIRouter(tags=["chat"])


async def _auteur(user_id: int) -> Optional[dict]:
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


# ==================== Chat de maison ====================

@router.get("/maisons/{maison_id}/messages")
async def list_messages(
    maison_id: int,
    avant_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    query = messages.select().where(messages.c.maison_id == maison_id)
    if avant_id:
        query = query.where(messages.c.id < avant_id)
    query = query.order_by(messages.c.id.desc()).limit(limit)
    rows = await database.fetch_all(query)

    result = []
    for r in rows:
        d = dict(r)
        d["auteur"] = await _auteur(r["utilisateur_id"])
        result.append(d)
    result.reverse()
    return result


@router.post("/maisons/{maison_id}/messages", status_code=status.HTTP_201_CREATED)
async def create_message(
    maison_id: int, data: MessageCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas envoyer de message")
    contenu = (data.contenu or "").strip()
    if not contenu:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message vide")

    message_id = await database.execute(
        messages.insert().values(maison_id=maison_id, utilisateur_id=current_user["id"], contenu=contenu)
    )
    row = await database.fetch_one(messages.select().where(messages.c.id == message_id))
    d = dict(row)
    d["auteur"] = await _auteur(current_user["id"])
    return d


# ==================== Commentaires d'activité ====================

async def _get_activite_or_404(activite_id: int) -> dict:
    row = await database.fetch_one(activites.select().where(activites.c.id == activite_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activité introuvable")
    return dict(row)


@router.get("/activites/{activite_id}/commentaires")
async def list_commentaires(activite_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])
    rows = await database.fetch_all(
        activite_commentaires.select()
        .where(activite_commentaires.c.activite_id == activite_id)
        .order_by(activite_commentaires.c.id.asc())
    )
    result = []
    for r in rows:
        d = dict(r)
        d["auteur"] = await _auteur(r["utilisateur_id"])
        result.append(d)
    return result


@router.post("/activites/{activite_id}/commentaires", status_code=status.HTTP_201_CREATED)
async def create_commentaire(
    activite_id: int, data: CommentaireCreateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])
    contenu = (data.contenu or "").strip()
    if not contenu:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Commentaire vide")

    commentaire_id = await database.execute(
        activite_commentaires.insert().values(
            activite_id=activite_id, utilisateur_id=current_user["id"], contenu=contenu
        )
    )

    assigne_rows = await database.fetch_all(
        "SELECT utilisateur_id FROM activite_assignations WHERE activite_id = :aid",
        values={"aid": activite_id},
    )
    cibles = [a["utilisateur_id"] for a in assigne_rows]
    await notifier(
        cibles,
        type="activite",
        titre="💬 Nouveau commentaire",
        message=f"Sur « {row['titre']} »",
        maison_id=row["maison_id"],
        lien=f"activite:{activite_id}",
        exclure=current_user["id"],
    )

    inserted = await database.fetch_one(
        activite_commentaires.select().where(activite_commentaires.c.id == commentaire_id)
    )
    d = dict(inserted)
    d["auteur"] = await _auteur(current_user["id"])
    return d
