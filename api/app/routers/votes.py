# app/routers/votes.py
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.database.database import database, vote_bulletins, vote_options, votes
from app.dependencies import get_current_user, require_membre, require_not_enfant, require_not_visiteur
from app.models.schemas import VoteCreateInput, VoteVoterInput
from app.services.notifications import notifier_maison
from app.utils.formatting import mini_user

router = APIRouter(tags=["votes"])


async def _get_vote_or_404(vote_id: int) -> dict:
    row = await database.fetch_one(votes.select().where(votes.c.id == vote_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote introuvable")
    return dict(row)


async def _createur_for(user_id: int) -> Optional[dict]:
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


async def _serialize_vote(row: dict, current_user_id: int) -> dict:
    data = dict(row)
    data["createur"] = await _createur_for(row["createur_id"])

    option_rows = await database.fetch_all(
        """
        SELECT vo.id, vo.texte,
               (SELECT COUNT(*) FROM vote_bulletins vb WHERE vb.option_id = vo.id) AS nb_voix
        FROM vote_options vo
        WHERE vo.vote_id = :vid
        ORDER BY vo.id ASC
        """,
        values={"vid": row["id"]},
    )
    options = [dict(r) for r in option_rows]
    data["options"] = options
    data["total_voix"] = sum(o["nb_voix"] for o in options)

    mon_bulletin = await database.fetch_one(
        vote_bulletins.select().where(
            (vote_bulletins.c.vote_id == row["id"])
            & (vote_bulletins.c.utilisateur_id == current_user_id)
        )
    )
    data["mon_vote_option_id"] = mon_bulletin["option_id"] if mon_bulletin else None
    return data


@router.get("/maisons/{maison_id}/votes")
async def list_votes(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        votes.select().where(votes.c.maison_id == maison_id).order_by(votes.c.date_creation.desc())
    )
    return [await _serialize_vote(dict(r), current_user["id"]) for r in rows]


@router.post("/maisons/{maison_id}/votes", status_code=status.HTTP_201_CREATED)
async def create_vote(
    maison_id: int, data: VoteCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_enfant(maison_id, current_user["id"], "Un compte enfant ne peut pas créer de vote")
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer de vote")

    options = [o.strip() for o in data.options if o and o.strip()]
    if len(options) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Il faut au moins 2 options")

    vote_id = await database.execute(
        votes.insert().values(
            maison_id=maison_id,
            question=data.question,
            description=data.description,
            createur_id=current_user["id"],
        )
    )
    for texte in options:
        await database.execute(vote_options.insert().values(vote_id=vote_id, texte=texte))

    # Prévient toute la maison qu'un vote est ouvert (décision à prendre ensemble).
    await notifier_maison(
        maison_id,
        type="vote",
        titre="🗳️ Nouveau vote",
        message=f"« {data.question} » — donne ton avis !",
        lien=f"vote:{vote_id}",
        exclure=current_user["id"],
    )

    row = await _get_vote_or_404(vote_id)
    return await _serialize_vote(row, current_user["id"])


@router.get("/votes/{vote_id}")
async def get_vote(vote_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_vote_or_404(vote_id)
    await require_membre(row["maison_id"], current_user["id"])
    return await _serialize_vote(row, current_user["id"])


@router.post("/votes/{vote_id}/voter")
async def voter(vote_id: int, data: VoteVoterInput, current_user: dict = Depends(get_current_user)):
    row = await _get_vote_or_404(vote_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas voter")

    if row["statut"] == "clos":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce vote est clos")

    option = await database.fetch_one(
        vote_options.select().where(
            (vote_options.c.id == data.option_id) & (vote_options.c.vote_id == vote_id)
        )
    )
    if not option:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option introuvable")

    existing = await database.fetch_one(
        vote_bulletins.select().where(
            (vote_bulletins.c.vote_id == vote_id)
            & (vote_bulletins.c.utilisateur_id == current_user["id"])
        )
    )
    if existing:
        await database.execute(
            vote_bulletins.update()
            .where(vote_bulletins.c.id == existing["id"])
            .values(option_id=data.option_id)
        )
    else:
        await database.execute(
            vote_bulletins.insert().values(
                vote_id=vote_id, option_id=data.option_id, utilisateur_id=current_user["id"]
            )
        )

    updated = await _get_vote_or_404(vote_id)
    return await _serialize_vote(updated, current_user["id"])


@router.post("/votes/{vote_id}/cloturer")
async def cloturer_vote(vote_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_vote_or_404(vote_id)
    membre_row = await require_not_enfant(
        row["maison_id"], current_user["id"], "Un compte enfant ne peut pas clôturer de vote"
    )
    role = membre_row["role"]

    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut clôturer ce vote",
        )

    await database.execute(
        votes.update().where(votes.c.id == vote_id).values(statut="clos", date_cloture=datetime.utcnow())
    )
    updated = await _get_vote_or_404(vote_id)
    return await _serialize_vote(updated, current_user["id"])


@router.delete("/votes/{vote_id}")
async def delete_vote(vote_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_vote_or_404(vote_id)
    role = await require_membre(row["maison_id"], current_user["id"])

    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut supprimer ce vote",
        )

    await database.execute(vote_bulletins.delete().where(vote_bulletins.c.vote_id == vote_id))
    await database.execute(vote_options.delete().where(vote_options.c.vote_id == vote_id))
    await database.execute(votes.delete().where(votes.c.id == vote_id))
    return {"message": "Vote supprimé"}
