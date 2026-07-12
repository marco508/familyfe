# app/routers/taches.py — Tâches domestiques (ANNEXE V4)
import json
from datetime import date, datetime
from datetime import time as dtime
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, pieces, taches, tache_validations
from app.dependencies import (
    get_current_user,
    get_role_in_maison,
    require_gestion,
    require_membre,
    require_membre_row,
)
from app.models.schemas import TacheCreateInput, TacheUpdateInput
from app.services.notifications import notifier
from app.services.points import ajuster_points
from app.utils.formatting import mini_user

router = APIRouter(tags=["taches"])

VALID_FREQUENCES = {"ponctuel", "quotidien", "hebdo", "mensuel"}
VALID_ASSIGNATIONS = {"fixe", "rotation"}


def _parse_dt(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "").split(".")[0])
    except (ValueError, TypeError):
        return None


def _parse_date(value) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _parse_ordre(value) -> List[int]:
    if not value:
        return []
    if isinstance(value, list):
        return [int(x) for x in value]
    try:
        parsed = json.loads(value)
        return [int(x) for x in parsed] if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


def _next_date(d: date, frequence: str) -> Optional[date]:
    if frequence == "quotidien":
        return d + timedelta(days=1)
    if frequence == "hebdo":
        return d + timedelta(days=7)
    if frequence == "mensuel":
        month = d.month + 1
        year = d.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        jours_dans_mois = [31, 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28,
                           31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        day = min(d.day, jours_dans_mois[month - 1])
        return date(year, month, day)
    return None  # ponctuel : pas d'occurrence suivante


def _combine_echeance(d: Optional[date], heure: Optional[str]) -> Optional[datetime]:
    if d is None:
        return None
    if heure:
        try:
            hh, mm = [int(x) for x in heure.split(":")[:2]]
            return datetime.combine(d, dtime(hh, mm))
        except (ValueError, TypeError):
            pass
    return datetime.combine(d, dtime(0, 0))


def _titulaire_id(row: dict) -> Optional[int]:
    if (row.get("assignation") or "fixe") == "rotation":
        ordre = _parse_ordre(row.get("rotation_ordre"))
        if not ordre:
            return None
        idx = int(row.get("rotation_index") or 0) % len(ordre)
        return ordre[idx]
    return row.get("assigne_id")


def _periode_cle(row: dict, ref: date) -> str:
    frequence = row.get("frequence") or "ponctuel"
    if frequence == "quotidien":
        return ref.isoformat()
    if frequence == "hebdo":
        iso = ref.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if frequence == "mensuel":
        return f"{ref.year}-{ref.month:02d}"
    return "once"


async def _get_tache_or_404(tache_id: int) -> dict:
    row = await database.fetch_one(taches.select().where(taches.c.id == tache_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tâche introuvable")
    return dict(row)


async def _mini_user_for(user_id: Optional[int]) -> Optional[dict]:
    if not user_id:
        return None
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


async def _fait_pour_periode(tache_id: int, periode_cle: str) -> bool:
    row = await database.fetch_one(
        tache_validations.select().where(
            (tache_validations.c.tache_id == tache_id) & (tache_validations.c.periode_cle == periode_cle)
        )
    )
    return bool(row)


async def _serialize_tache(row: dict) -> dict:
    data = dict(row)
    data["gage_actif"] = bool(data.get("gage_actif"))
    data["rotation_ordre"] = _parse_ordre(data.get("rotation_ordre"))
    titulaire_id = _titulaire_id(data)
    data["titulaire"] = await _mini_user_for(titulaire_id)
    periode = _periode_cle(data, date.today())
    data["fait_aujourdhui"] = await _fait_pour_periode(row["id"], periode)
    return data


async def _programmer_periode_suivante(row: dict) -> None:
    """Programme la période suivante (échéance selon `frequence`, avance la
    rotation si `assignation == 'rotation'`), statut remis à `a_faire`."""
    frequence = row.get("frequence") or "ponctuel"
    base = _parse_dt(row.get("prochaine_echeance"))
    base_date = base.date() if base else (_parse_date(row.get("echeance_date")) or date.today())
    next_date = _next_date(base_date, frequence)
    next_dt = _combine_echeance(next_date, row.get("echeance_heure"))

    values = {"statut": "a_faire", "prochaine_echeance": next_dt}
    if next_date:
        values["echeance_date"] = next_date

    new_titulaire = None
    if (row.get("assignation") or "fixe") == "rotation":
        ordre = _parse_ordre(row.get("rotation_ordre"))
        if ordre:
            idx = int(row.get("rotation_index") or 0) % len(ordre)
            new_idx = (idx + 1) % len(ordre)
            values["rotation_index"] = new_idx
            new_titulaire = ordre[new_idx]

    await database.execute(taches.update().where(taches.c.id == row["id"]).values(**values))

    titulaire_final = new_titulaire if new_titulaire is not None else row.get("assigne_id")
    if titulaire_final:
        await notifier(
            [titulaire_final],
            type="tache",
            titre="🔄 C'est ton tour !" if new_titulaire is not None else "🔁 Nouvelle période",
            message=f"À toi de t'occuper de « {row['titre']} ».",
            maison_id=row["maison_id"],
            lien=f"tache:{row['id']}",
        )


async def _appliquer_gage_taches_dues(maison_id: int) -> None:
    """Auto-gage : toute tâche dont `prochaine_echeance` est dépassée et non
    validée applique la pénalité au titulaire, notifie, puis programme la suite."""
    rows = await database.fetch_all(taches.select().where(taches.c.maison_id == maison_id))
    now = datetime.now()
    for r in rows:
        row = dict(r)
        if row.get("statut") == "fait" and (row.get("frequence") or "ponctuel") == "ponctuel":
            continue
        echeance = _parse_dt(row.get("prochaine_echeance"))
        if not echeance:
            continue

        garde = 0
        while echeance and now > echeance and garde < 52:
            titulaire = _titulaire_id(row)
            if titulaire:
                if row.get("gage_actif"):
                    await ajuster_points(
                        maison_id, [titulaire], -int(row.get("points_penalite") or 0),
                        motif=f"tache:penalite:{row['id']}",
                    )
                pen = row.get("penalite")
                await notifier(
                    [titulaire],
                    type="tache",
                    titre="⏰ Tâche non faite",
                    message=(
                        f"« {row['titre']} » n'a pas été faite à temps."
                        + (f" Gage : {pen}" if pen else "")
                    ),
                    maison_id=maison_id,
                    lien=f"tache:{row['id']}",
                )

            if (row.get("frequence") or "ponctuel") == "ponctuel":
                await database.execute(
                    taches.update().where(taches.c.id == row["id"]).values(prochaine_echeance=None)
                )
                break

            await _programmer_periode_suivante(row)
            row = await _get_tache_or_404(row["id"])
            echeance = _parse_dt(row.get("prochaine_echeance"))
            garde += 1


async def _valider_rotation_membres(maison_id: int, user_ids: List[int]) -> None:
    for uid in user_ids:
        role = await get_role_in_maison(maison_id, uid)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"L'utilisateur {uid} doit être membre de la maison pour participer à la rotation",
            )


@router.get("/maisons/{maison_id}/taches")
async def list_taches(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])

    # Auto-gage : fait avancer les tâches dont l'échéance est dépassée.
    await _appliquer_gage_taches_dues(maison_id)

    rows = await database.fetch_all(
        taches.select().where(taches.c.maison_id == maison_id).order_by(taches.c.date_creation.desc())
    )
    return [await _serialize_tache(dict(r)) for r in rows]


@router.post("/maisons/{maison_id}/taches", status_code=status.HTTP_201_CREATED)
async def create_tache(
    maison_id: int, data: TacheCreateInput, current_user: dict = Depends(get_current_user)
):
    """Création réservée à la gestion (chef/co-chef/chef temporaire)."""
    await require_gestion(maison_id, current_user["id"])

    frequence = data.frequence or "ponctuel"
    if frequence not in VALID_FREQUENCES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fréquence invalide")

    assignation = data.assignation or "fixe"
    if assignation not in VALID_ASSIGNATIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignation invalide")

    if data.piece_id is not None:
        piece = await database.fetch_one(
            pieces.select().where((pieces.c.id == data.piece_id) & (pieces.c.maison_id == maison_id))
        )
        if not piece:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pièce introuvable dans cette maison")

    rotation_ordre = data.rotation_ordre or []
    assigne_id = data.assigne_id
    if assignation == "rotation":
        if not rotation_ordre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rotation_ordre est requis pour une tâche en rotation",
            )
        await _valider_rotation_membres(maison_id, rotation_ordre)
        assigne_id = None
    elif assigne_id is not None:
        role = await get_role_in_maison(maison_id, assigne_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="L'assigné doit être membre de la maison"
            )

    prochaine_echeance = _combine_echeance(data.echeance_date, data.echeance_heure)

    tache_id = await database.execute(
        taches.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            description=data.description,
            piece_id=data.piece_id,
            frequence=frequence,
            assignation=assignation,
            assigne_id=assigne_id,
            rotation_ordre=json.dumps(rotation_ordre) if rotation_ordre else None,
            rotation_index=0,
            rotation_conditions=data.rotation_conditions,
            gage_actif=bool(data.gage_actif),
            penalite=data.penalite,
            recompense=data.recompense,
            points_penalite=int(data.points_penalite or 0),
            points_recompense=int(data.points_recompense or 0),
            echeance_date=data.echeance_date,
            echeance_heure=data.echeance_heure,
            statut="a_faire",
            prochaine_echeance=prochaine_echeance,
            createur_id=current_user["id"],
        )
    )

    row = await _get_tache_or_404(tache_id)
    titulaire = _titulaire_id(row)
    if titulaire:
        await notifier(
            [titulaire],
            type="tache",
            titre="🧹 Nouvelle tâche",
            message=f"« {data.titre} » t'a été confiée.",
            maison_id=maison_id,
            lien=f"tache:{tache_id}",
        )

    return await _serialize_tache(row)


@router.get("/taches/{tache_id}")
async def get_tache(tache_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_tache_or_404(tache_id)
    await require_membre(row["maison_id"], current_user["id"])
    return await _serialize_tache(row)


@router.put("/taches/{tache_id}")
async def update_tache(
    tache_id: int, data: TacheUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_tache_or_404(tache_id)
    await require_gestion(row["maison_id"], current_user["id"])

    values = {}
    if data.titre is not None:
        values["titre"] = data.titre
    if data.description is not None:
        values["description"] = data.description
    if data.piece_id is not None:
        piece = await database.fetch_one(
            pieces.select().where((pieces.c.id == data.piece_id) & (pieces.c.maison_id == row["maison_id"]))
        )
        if not piece:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pièce introuvable dans cette maison")
        values["piece_id"] = data.piece_id
    if data.frequence is not None:
        if data.frequence not in VALID_FREQUENCES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fréquence invalide")
        values["frequence"] = data.frequence
    if data.assignation is not None:
        if data.assignation not in VALID_ASSIGNATIONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignation invalide")
        values["assignation"] = data.assignation
    if data.assigne_id is not None:
        role = await get_role_in_maison(row["maison_id"], data.assigne_id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="L'assigné doit être membre de la maison"
            )
        values["assigne_id"] = data.assigne_id
    if data.rotation_ordre is not None:
        await _valider_rotation_membres(row["maison_id"], data.rotation_ordre)
        values["rotation_ordre"] = json.dumps(data.rotation_ordre) if data.rotation_ordre else None
    if data.rotation_conditions is not None:
        values["rotation_conditions"] = data.rotation_conditions
    if data.gage_actif is not None:
        values["gage_actif"] = bool(data.gage_actif)
    if data.penalite is not None:
        values["penalite"] = data.penalite
    if data.recompense is not None:
        values["recompense"] = data.recompense
    if data.points_penalite is not None:
        values["points_penalite"] = int(data.points_penalite)
    if data.points_recompense is not None:
        values["points_recompense"] = int(data.points_recompense)
    if data.statut is not None:
        values["statut"] = data.statut

    if data.echeance_date is not None or data.echeance_heure is not None:
        new_date = data.echeance_date if data.echeance_date is not None else row.get("echeance_date")
        new_heure = data.echeance_heure if data.echeance_heure is not None else row.get("echeance_heure")
        if data.echeance_date is not None:
            values["echeance_date"] = data.echeance_date
        if data.echeance_heure is not None:
            values["echeance_heure"] = data.echeance_heure
        values["prochaine_echeance"] = _combine_echeance(_parse_date(new_date), new_heure)

    if values:
        await database.execute(taches.update().where(taches.c.id == tache_id).values(**values))

    updated = await _get_tache_or_404(tache_id)
    return await _serialize_tache(updated)


@router.delete("/taches/{tache_id}")
async def delete_tache(tache_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_tache_or_404(tache_id)
    await require_gestion(row["maison_id"], current_user["id"])
    await database.execute(tache_validations.delete().where(tache_validations.c.tache_id == tache_id))
    await database.execute(taches.delete().where(taches.c.id == tache_id))
    return {"message": "Tâche supprimée"}


@router.post("/taches/{tache_id}/valider")
async def valider_tache(tache_id: int, current_user: dict = Depends(get_current_user)):
    """Valide la tâche pour la période courante (statut `fait`) + récompense (gage)
    au titulaire ; si récurrente/rotation, programme la période suivante."""
    row = await _get_tache_or_404(tache_id)
    membre_row = await require_membre_row(row["maison_id"], current_user["id"])
    role = membre_row["role"]
    titulaire = _titulaire_id(row)

    if role not in ("chef", "co_chef", "chef_temporaire") and current_user["id"] != titulaire:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le titulaire (ou la gestion) peut valider cette tâche",
        )

    frequence = row.get("frequence") or "ponctuel"
    if row.get("statut") == "fait" and frequence == "ponctuel":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cette tâche est déjà faite")

    periode = _periode_cle(row, date.today())
    if await _fait_pour_periode(tache_id, periode):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cette tâche a déjà été validée pour cette période"
        )

    await database.execute(
        tache_validations.insert().values(
            tache_id=tache_id, utilisateur_id=current_user["id"], periode_cle=periode
        )
    )

    if titulaire and row.get("gage_actif") and int(row.get("points_recompense") or 0):
        await ajuster_points(
            row["maison_id"], [titulaire], int(row.get("points_recompense") or 0),
            motif=f"tache:reussite:{tache_id}",
        )

    if frequence == "ponctuel":
        await database.execute(
            taches.update().where(taches.c.id == tache_id).values(statut="fait", prochaine_echeance=None)
        )
    else:
        await _programmer_periode_suivante(row)

    updated = await _get_tache_or_404(tache_id)
    return await _serialize_tache(updated)
