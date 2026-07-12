# app/routers/evenements.py
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.database.database import database, evenement_reponses, evenements
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import EvenementCreateInput, EvenementUpdateInput, ReponseEvenementInput
from app.services.notifications import notifier_maison
from app.utils.formatting import mini_user

router = APIRouter(tags=["evenements"])

VALID_REPONSES = {"oui", "non", "peut_etre"}


async def _get_evenement_or_404(evenement_id: int) -> dict:
    row = await database.fetch_one(evenements.select().where(evenements.c.id == evenement_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Événement introuvable")
    return dict(row)


async def _createur_for(user_id: int) -> Optional[dict]:
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


async def _reponses_for(evenement_id: int) -> list:
    rows = await database.fetch_all(
        """
        SELECT er.utilisateur_id, er.reponse, u.nom, u.image
        FROM evenement_reponses er
        JOIN utilisateurs u ON u.id = er.utilisateur_id
        WHERE er.evenement_id = :eid
        """,
        values={"eid": evenement_id},
    )
    return [dict(r) for r in rows]


async def _serialize(row: dict, current_user_id: Optional[int] = None) -> dict:
    data = dict(row)
    data["toute_la_journee"] = bool(data.get("toute_la_journee"))
    data["createur"] = await _createur_for(row["createur_id"])
    reponses = await _reponses_for(row["id"])
    data["reponses"] = reponses
    data["ma_reponse"] = None
    if current_user_id is not None:
        mine = next((r for r in reponses if r["utilisateur_id"] == current_user_id), None)
        data["ma_reponse"] = mine["reponse"] if mine else None
    return data


@router.get("/maisons/{maison_id}/evenements")
async def list_evenements(
    maison_id: int,
    debut: Optional[str] = Query(None),
    fin: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])

    query = evenements.select().where(evenements.c.maison_id == maison_id)
    if debut:
        query = query.where(evenements.c.date_debut >= debut)
    if fin:
        query = query.where(evenements.c.date_debut <= fin)
    query = query.order_by(evenements.c.date_debut.asc())

    rows = await database.fetch_all(query)
    return [await _serialize(dict(r), current_user["id"]) for r in rows]


@router.post("/maisons/{maison_id}/evenements", status_code=status.HTTP_201_CREATED)
async def create_evenement(
    maison_id: int, data: EvenementCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer d'événement")

    recurrence = data.recurrence or "aucune"
    if recurrence not in ("aucune", "hebdo", "mensuel"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Récurrence invalide")

    evenement_id = await database.execute(
        evenements.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            description=data.description,
            date_debut=data.date_debut,
            date_fin=data.date_fin,
            toute_la_journee=bool(data.toute_la_journee),
            lieu=data.lieu,
            couleur=data.couleur or "#7B5CFF",
            recurrence=recurrence,
            createur_id=current_user["id"],
        )
    )
    # Prévient toute la maison du nouvel événement partagé (agenda commun).
    quand = str(data.date_debut)
    await notifier_maison(
        maison_id,
        type="evenement",
        titre="📅 Nouvel événement",
        message=f"« {data.titre} » — {quand}",
        lien="agenda",
        exclure=current_user["id"],
    )
    row = await _get_evenement_or_404(evenement_id)
    return await _serialize(row, current_user["id"])


@router.get("/evenements/{evenement_id}")
async def get_evenement(evenement_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_evenement_or_404(evenement_id)
    await require_membre(row["maison_id"], current_user["id"])
    return await _serialize(row, current_user["id"])


@router.put("/evenements/{evenement_id}")
async def update_evenement(
    evenement_id: int, data: EvenementUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_evenement_or_404(evenement_id)
    await require_membre(row["maison_id"], current_user["id"])

    if data.recurrence is not None and data.recurrence not in ("aucune", "hebdo", "mensuel"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Récurrence invalide")

    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if values:
        await database.execute(
            evenements.update().where(evenements.c.id == evenement_id).values(**values)
        )

    updated = await _get_evenement_or_404(evenement_id)
    return await _serialize(updated, current_user["id"])


@router.delete("/evenements/{evenement_id}")
async def delete_evenement(evenement_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_evenement_or_404(evenement_id)
    role = await require_membre(row["maison_id"], current_user["id"])

    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut supprimer cet événement",
        )

    await database.execute(
        evenement_reponses.delete().where(evenement_reponses.c.evenement_id == evenement_id)
    )
    await database.execute(evenements.delete().where(evenements.c.id == evenement_id))
    return {"message": "Événement supprimé"}


# ==================== ANNEXE V3 — RSVP ====================

@router.post("/evenements/{evenement_id}/reponse")
async def repondre_evenement(
    evenement_id: int, data: ReponseEvenementInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_evenement_or_404(evenement_id)
    await require_membre(row["maison_id"], current_user["id"])

    if data.reponse not in VALID_REPONSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Réponse invalide")

    existing = await database.fetch_one(
        evenement_reponses.select().where(
            (evenement_reponses.c.evenement_id == evenement_id)
            & (evenement_reponses.c.utilisateur_id == current_user["id"])
        )
    )
    if existing:
        await database.execute(
            evenement_reponses.update()
            .where(evenement_reponses.c.id == existing["id"])
            .values(reponse=data.reponse)
        )
    else:
        await database.execute(
            evenement_reponses.insert().values(
                evenement_id=evenement_id, utilisateur_id=current_user["id"], reponse=data.reponse
            )
        )

    updated = await _get_evenement_or_404(evenement_id)
    return await _serialize(updated, current_user["id"])


# ==================== ANNEXE V3 — Export iCal ====================

def _ics_escape(text: Optional[str]) -> str:
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _ics_dt(value) -> str:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", ""))
        except ValueError:
            return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    if not isinstance(value, datetime):
        return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    return value.strftime("%Y%m%dT%H%M%SZ")


@router.get("/maisons/{maison_id}/agenda.ics")
async def agenda_ics(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Export iCal (text/calendar) de l'agenda de la maison — importable dans
    Google/Apple Calendar. Sync deux sens = hors périmètre (OAuth requis)."""
    await require_membre(maison_id, current_user["id"])

    rows = await database.fetch_all(
        evenements.select().where(evenements.c.maison_id == maison_id).order_by(evenements.c.date_debut.asc())
    )

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FamyLife//Agenda//FR", "CALSCALE:GREGORIAN"]
    for r in rows:
        d = dict(r)
        dtstart = d["date_debut"]
        dtend = d.get("date_fin") or dtstart
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:evenement-{d['id']}@famylife")
        lines.append(f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}")
        lines.append(f"DTSTART:{_ics_dt(dtstart)}")
        lines.append(f"DTEND:{_ics_dt(dtend)}")
        lines.append(f"SUMMARY:{_ics_escape(d['titre'])}")
        if d.get("description"):
            lines.append(f"DESCRIPTION:{_ics_escape(d['description'])}")
        if d.get("lieu"):
            lines.append(f"LOCATION:{_ics_escape(d['lieu'])}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines) + "\r\n"
    return Response(
        content=body,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="agenda-{maison_id}.ics"'},
    )
