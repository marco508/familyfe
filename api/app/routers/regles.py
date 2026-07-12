# app/routers/regles.py — Règles de la maison (votées) + rappel (ANNEXE V4)
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.database.database import database, membres_maison, regles, vote_bulletins, vote_options, votes
from app.dependencies import get_current_user, require_gestion, require_membre, require_membre_row
from app.models.schemas import RegleCreateInput, RegleUpdateInput
from app.services.notifications import notifier_maison
from app.utils.formatting import mini_user

router = APIRouter(tags=["regles"])

VALID_STATUTS = {"proposee", "adoptee", "rejetee"}


async def _get_regle_or_404(regle_id: int) -> dict:
    row = await database.fetch_one(regles.select().where(regles.c.id == regle_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Règle introuvable")
    return dict(row)


async def _createur_for(user_id: int) -> Optional[dict]:
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


async def _serialize(row: dict, current_user_id: int) -> dict:
    """Aplati les résultats de vote directement sur la règle (mêmes clés que
    `votes.py::_serialize_vote` : `options`, `total_voix`, `mon_vote_option_id`)
    car l'UI mobile les lit à plat (`r.options`, pas `r.vote.options`)."""
    data = dict(row)
    data["createur"] = await _createur_for(row["createur_id"])

    vote_id = row.get("vote_id")
    if not vote_id:
        data["options"] = None
        data["total_voix"] = None
        data["mon_vote_option_id"] = None
        return data

    option_rows = await database.fetch_all(
        """
        SELECT vo.id, vo.texte,
               (SELECT COUNT(*) FROM vote_bulletins vb WHERE vb.option_id = vo.id) AS nb_voix
        FROM vote_options vo
        WHERE vo.vote_id = :vid
        ORDER BY vo.id ASC
        """,
        values={"vid": vote_id},
    )
    options = [dict(r) for r in option_rows]
    data["options"] = options
    data["total_voix"] = sum(o["nb_voix"] for o in options)

    mon_bulletin = await database.fetch_one(
        vote_bulletins.select().where(
            (vote_bulletins.c.vote_id == vote_id)
            & (vote_bulletins.c.utilisateur_id == current_user_id)
        )
    )
    data["mon_vote_option_id"] = mon_bulletin["option_id"] if mon_bulletin else None
    return data


@router.get("/maisons/{maison_id}/regles")
async def list_regles(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        regles.select().where(regles.c.maison_id == maison_id).order_by(regles.c.ordre.asc(), regles.c.id.asc())
    )
    return [await _serialize(dict(r), current_user["id"]) for r in rows]


@router.post("/maisons/{maison_id}/regles", status_code=status.HTTP_201_CREATED)
async def create_regle(
    maison_id: int, data: RegleCreateInput, current_user: dict = Depends(get_current_user)
):
    """Propose une règle (gestion). Si `soumettre_au_vote`, crée un vote lié oui/non
    et la règle reste `proposee` jusqu'à /adopter ou /rejeter ; sinon elle est
    directement `adoptee`."""
    await require_gestion(maison_id, current_user["id"])

    count_row = await database.fetch_one(
        "SELECT COUNT(*) AS n FROM regles WHERE maison_id = :mid", values={"mid": maison_id}
    )
    ordre = (count_row["n"] if count_row else 0) + 1

    vote_id = None
    statut = "adoptee"
    if data.soumettre_au_vote:
        vote_id = await database.execute(
            votes.insert().values(
                maison_id=maison_id,
                question=f"Adopter la règle « {data.titre} » ?",
                description=data.contenu,
                createur_id=current_user["id"],
            )
        )
        await database.execute(vote_options.insert().values(vote_id=vote_id, texte="Oui"))
        await database.execute(vote_options.insert().values(vote_id=vote_id, texte="Non"))
        statut = "proposee"

    regle_id = await database.execute(
        regles.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            contenu=data.contenu,
            statut=statut,
            vote_id=vote_id,
            ordre=ordre,
            createur_id=current_user["id"],
        )
    )

    if data.soumettre_au_vote:
        await notifier_maison(
            maison_id,
            type="regle",
            titre="🗳️ Nouvelle règle proposée au vote",
            message=f"« {data.titre} » — donne ton avis !",
            lien=f"vote:{vote_id}",
            exclure=current_user["id"],
        )
    else:
        await notifier_maison(
            maison_id,
            type="regle",
            titre="📜 Nouvelle règle adoptée",
            message=f"« {data.titre} »",
            lien="regles",
            exclure=current_user["id"],
        )

    return await _serialize(await _get_regle_or_404(regle_id), current_user["id"])


@router.put("/regles/{regle_id}")
async def update_regle(
    regle_id: int, data: RegleUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_regle_or_404(regle_id)
    await require_gestion(row["maison_id"], current_user["id"])

    values = {}
    if data.titre is not None:
        values["titre"] = data.titre
    if data.contenu is not None:
        values["contenu"] = data.contenu
    if data.ordre is not None:
        values["ordre"] = data.ordre

    if values:
        await database.execute(regles.update().where(regles.c.id == regle_id).values(**values))

    return await _serialize(await _get_regle_or_404(regle_id), current_user["id"])


@router.delete("/regles/{regle_id}")
async def delete_regle(regle_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_regle_or_404(regle_id)
    await require_gestion(row["maison_id"], current_user["id"])
    await database.execute(regles.delete().where(regles.c.id == regle_id))
    return {"message": "Règle supprimée"}


@router.post("/regles/{regle_id}/adopter")
async def adopter_regle(regle_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_regle_or_404(regle_id)
    await require_gestion(row["maison_id"], current_user["id"])

    await database.execute(regles.update().where(regles.c.id == regle_id).values(statut="adoptee"))
    await notifier_maison(
        row["maison_id"],
        type="regle",
        titre="✅ Règle adoptée",
        message=f"« {row['titre']} » a été adoptée.",
        lien="regles",
    )
    return await _serialize(await _get_regle_or_404(regle_id), current_user["id"])


@router.post("/regles/{regle_id}/rejeter")
async def rejeter_regle(regle_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_regle_or_404(regle_id)
    await require_gestion(row["maison_id"], current_user["id"])

    await database.execute(regles.update().where(regles.c.id == regle_id).values(statut="rejetee"))
    return await _serialize(await _get_regle_or_404(regle_id), current_user["id"])


# ==================== Rappel des règles ====================

@router.get("/maisons/{maison_id}/regles/a-lire")
async def regles_a_lire(maison_id: int, current_user: dict = Depends(get_current_user)):
    """`doit_lire` = l'appelant n'a jamais lu les règles (regles_vues_le NULL) et
    il existe au moins une règle adoptée."""
    membre_row = await require_membre_row(maison_id, current_user["id"])

    rows = await database.fetch_all(
        regles.select()
        .where((regles.c.maison_id == maison_id) & (regles.c.statut == "adoptee"))
        .order_by(regles.c.ordre.asc(), regles.c.id.asc())
    )
    adoptees = [dict(r) for r in rows]
    doit_lire = membre_row.get("regles_vues_le") is None and len(adoptees) > 0
    return {"doit_lire": doit_lire, "regles": adoptees}


@router.post("/maisons/{maison_id}/regles/lues")
async def marquer_regles_lues(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    now = datetime.utcnow()
    await database.execute(
        membres_maison.update()
        .where(
            (membres_maison.c.maison_id == maison_id)
            & (membres_maison.c.utilisateur_id == current_user["id"])
        )
        .values(regles_vues_le=now)
    )
    return {"message": "Règles marquées comme lues", "regles_vues_le": now.isoformat()}
