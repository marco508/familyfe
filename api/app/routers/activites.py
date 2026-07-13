# app/routers/activites.py
import json
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.database.database import (
    activite_assignations,
    activite_commentaires,
    activite_participants,
    activite_sous_taches,
    activites,
    database,
    membres_maison,
)
from app.dependencies import get_current_user, get_role_in_maison, require_membre, require_not_visiteur
from app.models.schemas import (
    ActiviteCreateInput,
    ActiviteStatutInput,
    ActiviteUpdateInput,
    GageResoudreInput,
    SousTacheCreateInput,
    SousTacheUpdateInput,
)
from app.services.notifications import notifier
from app.services.points import ajuster_points
from app.services.gage_effets import appliquer_effets, dumps_effets, parse_effets
from app.services.uploads import save_upload
from app.utils.formatting import mini_user

router = APIRouter(tags=["activites"])

VALID_STATUTS = {"a_faire", "en_cours", "termine"}
VALID_GAGE_RESULTATS = {"reussi", "echoue"}
VALID_RECURRENCES = {"aucune", "quotidien", "hebdo", "mensuel"}
VALID_VISIBILITES = {"maison", "participants"}


def _next_weekday(d: date, weekday: int) -> date:
    """Prochaine date tombant sur `weekday` (0=lundi … 6=dimanche), après `d`."""
    delta = (weekday - d.weekday() - 1) % 7 + 1
    return d + timedelta(days=delta)


def _parse_dt(value) -> Optional[datetime]:
    """Parse une valeur TIMESTAMP (datetime ou str ISO) de façon tolérante."""
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


def _prochaine_echeance(d: Optional[date], recurrence: str) -> Optional[date]:
    """Calcule l'échéance de la prochaine occurrence selon la récurrence."""
    d = _parse_date(d)
    if d is None:
        return None
    if recurrence == "quotidien":
        return d + timedelta(days=1)
    if recurrence == "hebdo":
        return d + timedelta(days=7)
    if recurrence == "mensuel":
        month = d.month + 1
        year = d.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        jours_dans_mois = [31, 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28,
                           31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        day = min(d.day, jours_dans_mois[month - 1])
        return date(year, month, day)
    return None


async def _get_activite_or_404(activite_id: int) -> dict:
    row = await database.fetch_one(activites.select().where(activites.c.id == activite_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activité introuvable")
    return dict(row)


async def _assignes_for(activite_id: int) -> list:
    rows = await database.fetch_all(
        """
        SELECT u.id, u.nom, u.image
        FROM activite_assignations aa
        JOIN utilisateurs u ON u.id = aa.utilisateur_id
        WHERE aa.activite_id = :aid
        ORDER BY u.nom ASC
        """,
        values={"aid": activite_id},
    )
    return [mini_user(r) for r in rows]


async def _participants_for(activite_id: int) -> list:
    rows = await database.fetch_all(
        """
        SELECT u.id, u.nom, u.image
        FROM activite_participants ap
        JOIN utilisateurs u ON u.id = ap.utilisateur_id
        WHERE ap.activite_id = :aid
        ORDER BY u.nom ASC
        """,
        values={"aid": activite_id},
    )
    return [mini_user(r) for r in rows]


async def _set_participants(maison_id: int, activite_id: int, user_ids: List[int]) -> None:
    await database.execute(
        activite_participants.delete().where(activite_participants.c.activite_id == activite_id)
    )
    seen = set()
    for uid in user_ids or []:
        if uid in seen:
            continue
        seen.add(uid)
        role = await get_role_in_maison(maison_id, uid)
        if role is None:
            continue
        await database.execute(
            activite_participants.insert().values(activite_id=activite_id, utilisateur_id=uid)
        )


async def _est_visible(row: dict, current_user_id: int) -> bool:
    """ANNEXE V4 : une activité `visibilite=participants` n'est visible que par
    ses participants et son créateur."""
    if (row.get("visibilite") or "maison") != "participants":
        return True
    if row["createur_id"] == current_user_id:
        return True
    participant = await database.fetch_one(
        activite_participants.select().where(
            (activite_participants.c.activite_id == row["id"])
            & (activite_participants.c.utilisateur_id == current_user_id)
        )
    )
    return bool(participant)


async def _sous_taches_for(activite_id: int) -> list:
    rows = await database.fetch_all(
        activite_sous_taches.select()
        .where(activite_sous_taches.c.activite_id == activite_id)
        .order_by(activite_sous_taches.c.id.asc())
    )
    return [{"id": r["id"], "titre": r["titre"], "fait": bool(r["fait"])} for r in rows]


async def _createur_for(user_id: int) -> Optional[dict]:
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid", values={"uid": user_id}
    )
    return mini_user(row) if row else None


async def _serialize_activite(row: dict) -> dict:
    data = dict(row)
    # SQLite stocke les booléens en 0/1 : on normalise pour le client.
    data["gage_actif"] = bool(data.get("gage_actif"))
    data["rappel"] = bool(data.get("rappel"))
    data["rotation_active"] = bool(data.get("rotation_active"))
    data["rotation_ordre"] = _parse_ordre(data.get("rotation_ordre"))
    data["recurrence"] = data.get("recurrence") or "aucune"
    data["visibilite"] = data.get("visibilite") or "maison"
    data["createur"] = await _createur_for(row["createur_id"])
    data["assignes"] = await _assignes_for(row["id"])
    data["participants"] = await _participants_for(row["id"])
    data["sous_taches"] = await _sous_taches_for(row["id"])
    # Titulaire courant du tour (rotation) pour affichage direct côté client.
    data["rotation_titulaire"] = None
    if data["rotation_active"] and data["rotation_ordre"]:
        idx = int(data.get("rotation_index") or 0) % len(data["rotation_ordre"])
        holder_id = data["rotation_ordre"][idx]
        data["rotation_titulaire"] = await _createur_for(holder_id)
    data["gage_effets_echec"] = parse_effets(data.get("gage_effets_echec"))
    data["gage_effets_reussite"] = parse_effets(data.get("gage_effets_reussite"))
    return data


async def _creer_occurrence_suivante(row: dict) -> Optional[int]:
    """Récurrence (ANNEXE V3) : quand une activité récurrente se termine, crée
    automatiquement la prochaine occurrence (échéance décalée, statut a_faire,
    gage/rotation/récurrence conservés, résultat gage remis à en_attente)."""
    recurrence = row.get("recurrence") or "aucune"
    if recurrence not in ("quotidien", "hebdo", "mensuel"):
        return None

    nouvelle_echeance = _prochaine_echeance(row.get("date_echeance"), recurrence)

    assigne_rows = await database.fetch_all(
        "SELECT utilisateur_id FROM activite_assignations WHERE activite_id = :aid",
        values={"aid": row["id"]},
    )
    assigne_ids = [a["utilisateur_id"] for a in assigne_rows]

    participant_rows = await database.fetch_all(
        "SELECT utilisateur_id FROM activite_participants WHERE activite_id = :aid",
        values={"aid": row["id"]},
    )
    participant_ids = [p["utilisateur_id"] for p in participant_rows]

    new_id = await database.execute(
        activites.insert().values(
            maison_id=row["maison_id"],
            titre=row["titre"],
            description=row.get("description"),
            statut="a_faire",
            date_echeance=nouvelle_echeance,
            heure_echeance=row.get("heure_echeance"),
            rappel=bool(row.get("rappel")),
            gage_actif=bool(row.get("gage_actif")),
            penalite=row.get("penalite"),
            recompense=row.get("recompense"),
            points_penalite=int(row.get("points_penalite") or 0),
            points_recompense=int(row.get("points_recompense") or 0),
            gage_resultat="en_attente",
            recurrence=recurrence,
            visibilite=row.get("visibilite") or "maison",
            rotation_active=bool(row.get("rotation_active")),
            rotation_ordre=row.get("rotation_ordre"),
            rotation_index=int(row.get("rotation_index") or 0),
            rotation_delai_jours=int(row.get("rotation_delai_jours") or 0),
            rotation_echeance=None,
            createur_id=row["createur_id"],
        )
    )
    if assigne_ids:
        await _set_assignations(row["maison_id"], new_id, assigne_ids)
    if participant_ids:
        await _set_participants(row["maison_id"], new_id, participant_ids)
    return new_id


async def _resoudre_gage(row: dict, resultat: str) -> dict:
    """Applique le résultat du gage (récompense/pénalité) et met à jour l'activité."""
    if not row.get("gage_actif"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun gage n'est activé sur cette activité",
        )
    if row.get("gage_resultat") in VALID_GAGE_RESULTATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Le gage a déjà été résolu"
        )

    assigne_rows = await database.fetch_all(
        "SELECT utilisateur_id FROM activite_assignations WHERE activite_id = :aid",
        values={"aid": row["id"]},
    )
    assigne_ids = [r["utilisateur_id"] for r in assigne_rows]

    if resultat == "reussi":
        delta = int(row.get("points_recompense") or 0)
        new_statut = "termine"
    else:  # echoue
        delta = -int(row.get("points_penalite") or 0)
        new_statut = row["statut"]

    # « Claim » atomique : la résolution n'est appliquée que si le gage est
    # encore 'en_attente', dans la même requête. Un seul appel concurrent gagne
    # le claim → plus de double attribution de points (TOCTOU supprimé).
    async with database.transaction():
        claimed = await database.fetch_one(
            """
            UPDATE activites SET gage_resultat = :res, statut = :st
            WHERE id = :id AND gage_resultat = 'en_attente'
            RETURNING id
            """,
            values={"res": resultat, "st": new_statut, "id": row["id"]},
        )
        if claimed is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Le gage a déjà été résolu"
            )
        await ajuster_points(
            row["maison_id"], assigne_ids, delta, motif=f"gage:{resultat}:activite:{row['id']}"
        )
        # Effets de gage paramétrables (points/tâche/amende/note) appliqués
        # automatiquement aux assignés selon le résultat.
        effets = row.get("gage_effets_reussite") if resultat == "reussi" else row.get("gage_effets_echec")
        if effets and assigne_ids:
            await appliquer_effets(
                effets,
                maison_id=row["maison_id"],
                cibles=assigne_ids,
                source_titre=row["titre"],
                createur_id=row["createur_id"],
            )

    updated = await _get_activite_or_404(row["id"])
    if resultat == "reussi":
        await _creer_occurrence_suivante(updated)
    return updated


async def _avancer_rotation(row: dict, manque: bool) -> dict:
    """Passe le tour au membre suivant (relais).

    - manque=True  : le titulaire n'a pas fait son tour à temps → pénalité (gage)
                     éventuelle, puis passage au suivant.
    - manque=False : le titulaire a terminé son tour → récompense (gage) éventuelle,
                     puis passage au suivant.
    Le nouveau titulaire est (ré)assigné, le statut repart à 'a_faire', une nouvelle
    échéance est posée, et une notification est envoyée.
    """
    ordre = _parse_ordre(row.get("rotation_ordre"))
    if len(ordre) < 1:
        return await _get_activite_or_404(row["id"])

    idx = int(row.get("rotation_index") or 0) % len(ordre)
    titulaire = ordre[idx]
    maison_id = row["maison_id"]

    if row.get("gage_actif"):
        if manque:
            await ajuster_points(
                maison_id, [titulaire], -int(row.get("points_penalite") or 0), motif="rotation:manque"
            )
        else:
            await ajuster_points(
                maison_id, [titulaire], int(row.get("points_recompense") or 0), motif="rotation:reussite"
            )

    if manque:
        pen = row.get("penalite")
        await notifier(
            [titulaire],
            type="rotation",
            titre="⏰ Tour manqué",
            message=(
                f"Tu n'as pas fait « {row['titre']} » à temps."
                + (f" Gage : {pen}" if pen else "")
            ),
            maison_id=maison_id,
            lien=f"activite:{row['id']}",
        )

    new_idx = (idx + 1) % len(ordre)
    new_titulaire = ordre[new_idx]
    delai = int(row.get("rotation_delai_jours") or 0)
    new_echeance = datetime.now() + timedelta(days=delai) if delai > 0 else None

    await database.execute(
        activites.update()
        .where(activites.c.id == row["id"])
        .values(rotation_index=new_idx, rotation_echeance=new_echeance, statut="a_faire")
    )
    await _set_assignations(maison_id, row["id"], [new_titulaire])
    await notifier(
        [new_titulaire],
        type="rotation",
        titre="🔄 C'est ton tour !",
        message=f"À toi de t'occuper de « {row['titre']} ».",
        maison_id=maison_id,
        lien=f"activite:{row['id']}",
    )
    return await _get_activite_or_404(row["id"])


async def _appliquer_rotations_dues(maison_id: int) -> None:
    """Fait avancer automatiquement les rotations dont l'échéance est dépassée
    (relais de tour non tenu). Appelé à la consultation de la liste des activités."""
    rows = await database.fetch_all(
        activites.select().where(
            (activites.c.maison_id == maison_id)
            & (activites.c.rotation_active == True)  # noqa: E712
        )
    )
    now = datetime.now()
    for r in rows:
        row = dict(r)
        if row.get("statut") == "termine":
            continue
        echeance = _parse_dt(row.get("rotation_echeance"))
        ordre = _parse_ordre(row.get("rotation_ordre"))
        if not echeance or len(ordre) < 1:
            continue
        # Avance d'un pas par échéance dépassée (borné pour éviter toute boucle).
        garde = 0
        while echeance and now > echeance and garde < len(ordre):
            row = await _avancer_rotation(row, manque=True)
            echeance = _parse_dt(row.get("rotation_echeance"))
            garde += 1


async def _set_assignations(maison_id: int, activite_id: int, user_ids: List[int]) -> None:
    await database.execute(
        activite_assignations.delete().where(activite_assignations.c.activite_id == activite_id)
    )
    seen = set()
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        # Un assigné doit être membre de la maison ; on ignore silencieusement les autres.
        role = await get_role_in_maison(maison_id, uid)
        if role is None:
            continue
        await database.execute(
            activite_assignations.insert().values(activite_id=activite_id, utilisateur_id=uid)
        )


@router.get("/maisons/{maison_id}/activites")
async def list_activites(
    maison_id: int,
    statut: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])

    # Les rotations échues sont désormais avancées par le scheduler
    # (app/services/scheduler.py), plus à la lecture — évite les effets de bord
    # et les races sur un simple GET.
    query = activites.select().where(activites.c.maison_id == maison_id)
    if statut:
        query = query.where(activites.c.statut == statut)
    query = query.order_by(activites.c.date_creation.desc()).limit(limit).offset(offset)

    rows = await database.fetch_all(query)
    result = []
    for r in rows:
        row = dict(r)
        # ANNEXE V4 : filtre les activités à visibilité restreinte (participants/créateur).
        if not await _est_visible(row, current_user["id"]):
            continue
        result.append(await _serialize_activite(row))
    return result


@router.post("/maisons/{maison_id}/activites", status_code=status.HTTP_201_CREATED)
async def create_activite(
    maison_id: int, data: ActiviteCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer d'activité")

    statut = data.statut or "a_faire"
    if statut not in VALID_STATUTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Statut invalide")

    recurrence = data.recurrence or "aucune"
    if recurrence not in VALID_RECURRENCES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Récurrence invalide")

    visibilite = data.visibilite or "maison"
    if visibilite not in VALID_VISIBILITES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visibilité invalide")

    # Rotation : ordre des membres + première échéance (si un délai est fixé).
    rotation_active = bool(data.rotation_active)
    rotation_ordre = data.rotation_ordre or []
    rotation_delai = int(data.rotation_delai_jours or 0)
    rotation_echeance = None
    if rotation_active and rotation_ordre and rotation_delai > 0:
        rotation_echeance = datetime.now() + timedelta(days=rotation_delai)

    # Échéance : date explicite, ou calée sur un jour-seuil (echeance_jour_semaine).
    date_echeance = data.date_echeance
    if date_echeance is None and data.echeance_jour_semaine is not None:
        date_echeance = _next_weekday(date.today(), int(data.echeance_jour_semaine))

    activite_id = await database.execute(
        activites.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            description=data.description,
            statut=statut,
            date_echeance=date_echeance,
            heure_echeance=data.heure_echeance,
            echeance_jour_semaine=data.echeance_jour_semaine,
            rappel=bool(data.rappel),
            gage_actif=bool(data.gage_actif),
            penalite=data.penalite,
            recompense=data.recompense,
            points_penalite=int(data.points_penalite or 0),
            points_recompense=int(data.points_recompense or 0),
            gage_effets_echec=dumps_effets(data.gage_effets_echec),
            gage_effets_reussite=dumps_effets(data.gage_effets_reussite),
            recurrence=recurrence,
            visibilite=visibilite,
            rotation_active=rotation_active,
            rotation_ordre=json.dumps(rotation_ordre) if rotation_ordre else None,
            rotation_index=0,
            rotation_delai_jours=rotation_delai,
            rotation_echeance=rotation_echeance,
            createur_id=current_user["id"],
        )
    )

    # En rotation, le premier titulaire est l'assigné courant.
    if rotation_active and rotation_ordre:
        await _set_assignations(maison_id, activite_id, [rotation_ordre[0]])
    elif data.assignes:
        await _set_assignations(maison_id, activite_id, data.assignes)

    # ANNEXE V4 : activité sociale à participants restreints.
    if visibilite == "participants" and data.participants:
        await _set_participants(maison_id, activite_id, data.participants)

    # Notifie les personnes concernées (rappel activé) de la nouvelle activité.
    if data.rappel:
        quand = ""
        if data.date_echeance:
            quand = f" pour le {data.date_echeance}"
            if data.heure_echeance:
                quand += f" à {data.heure_echeance}"
        cibles: List[int] = []
        exclure = current_user["id"]
        if visibilite == "participants":
            # ANNEXE V4 : ne notifier QUE les participants (jamais toute la maison).
            cibles = list(data.participants or [])
        elif rotation_active and rotation_ordre:
            cibles = [rotation_ordre[0]]
            exclure = None
        elif data.assignes:
            cibles = list(data.assignes)
        else:
            # Activité commune (à faire ensemble) : on prévient toute la maison.
            member_rows = await database.fetch_all(
                "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid",
                values={"mid": maison_id},
            )
            cibles = [m["utilisateur_id"] for m in member_rows]
        await notifier(
            cibles,
            type="activite",
            titre="🧩 Nouvelle activité",
            message=f"« {data.titre} »{quand}",
            maison_id=maison_id,
            lien=f"activite:{activite_id}",
            exclure=exclure,
        )

    row = await _get_activite_or_404(activite_id)
    return await _serialize_activite(row)


@router.get("/activites/{activite_id}")
async def get_activite(activite_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])
    if not await _est_visible(row, current_user["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette activité est réservée à ses participants",
        )
    return await _serialize_activite(row)


@router.put("/activites/{activite_id}")
async def update_activite(
    activite_id: int, data: ActiviteUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_activite_or_404(activite_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas modifier d'activité")

    values = {}
    if data.titre is not None:
        values["titre"] = data.titre
    if data.description is not None:
        values["description"] = data.description
    if data.statut is not None:
        if data.statut not in VALID_STATUTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Statut invalide")
        values["statut"] = data.statut
    if data.date_echeance is not None:
        values["date_echeance"] = data.date_echeance
    if data.heure_echeance is not None:
        values["heure_echeance"] = data.heure_echeance
    if data.echeance_jour_semaine is not None:
        values["echeance_jour_semaine"] = int(data.echeance_jour_semaine)
        # Jour-seuil fourni sans date : cale l'échéance sur la prochaine occurrence.
        if data.date_echeance is None:
            values["date_echeance"] = _next_weekday(date.today(), int(data.echeance_jour_semaine))
    if data.rappel is not None:
        values["rappel"] = bool(data.rappel)
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
    if data.gage_effets_echec is not None:
        values["gage_effets_echec"] = dumps_effets(data.gage_effets_echec)
    if data.gage_effets_reussite is not None:
        values["gage_effets_reussite"] = dumps_effets(data.gage_effets_reussite)
    if data.rotation_active is not None:
        values["rotation_active"] = bool(data.rotation_active)
    if data.rotation_ordre is not None:
        values["rotation_ordre"] = json.dumps(data.rotation_ordre) if data.rotation_ordre else None
    if data.rotation_delai_jours is not None:
        values["rotation_delai_jours"] = int(data.rotation_delai_jours)
    if data.recurrence is not None:
        if data.recurrence not in VALID_RECURRENCES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Récurrence invalide")
        values["recurrence"] = data.recurrence
    if data.visibilite is not None:
        if data.visibilite not in VALID_VISIBILITES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visibilité invalide")
        values["visibilite"] = data.visibilite

    if values:
        await database.execute(activites.update().where(activites.c.id == activite_id).values(**values))

    if data.assignes is not None:
        await _set_assignations(row["maison_id"], activite_id, data.assignes)
    if data.participants is not None:
        await _set_participants(row["maison_id"], activite_id, data.participants)

    updated = await _get_activite_or_404(activite_id)
    return await _serialize_activite(updated)


@router.patch("/activites/{activite_id}/statut")
async def update_statut(
    activite_id: int, data: ActiviteStatutInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_activite_or_404(activite_id)
    await require_not_visiteur(row["maison_id"], current_user["id"], "Un visiteur ne peut pas modifier d'activité")

    if data.statut not in VALID_STATUTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Statut invalide")

    await database.execute(
        activites.update().where(activites.c.id == activite_id).values(statut=data.statut)
    )

    if data.statut == "termine":
        if row.get("gage_actif") and row.get("gage_resultat") == "en_attente":
            # Marquer "terminé" une activité avec un gage encore en attente vaut réussite :
            # la récompense est octroyée automatiquement aux assignés (gère aussi la récurrence).
            fresh = await _get_activite_or_404(activite_id)
            await _resoudre_gage(fresh, "reussi")
        else:
            # Pas de gage (ou déjà résolu) : déclenche quand même la récurrence si activée.
            fresh = await _get_activite_or_404(activite_id)
            await _creer_occurrence_suivante(fresh)

    updated = await _get_activite_or_404(activite_id)
    return await _serialize_activite(updated)


@router.post("/activites/{activite_id}/gage/resoudre")
async def resoudre_gage(
    activite_id: int, data: GageResoudreInput, current_user: dict = Depends(get_current_user)
):
    """Résout le gage d'une activité (chef, co-chef ou créateur).
    'reussi' -> récompense (+points_recompense aux assignés, activité terminée) ;
    'echoue' -> gage/pénalité (-points_penalite aux assignés).
    """
    row = await _get_activite_or_404(activite_id)
    role = await require_membre(row["maison_id"], current_user["id"])

    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut résoudre le gage",
        )

    if data.resultat not in VALID_GAGE_RESULTATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Résultat invalide (attendu: 'reussi' ou 'echoue')",
        )

    updated = await _resoudre_gage(row, data.resultat)
    return await _serialize_activite(updated)


@router.post("/activites/{activite_id}/rotation/suivant")
async def rotation_suivant(activite_id: int, current_user: dict = Depends(get_current_user)):
    """Passe le tour au membre suivant (le titulaire courant a fait sa part).
    Autorisé à la gestion (chef/co-chef), au créateur ou au titulaire courant. Applique
    la récompense (gage) au titulaire sortant puis réassigne le suivant.
    """
    row = await _get_activite_or_404(activite_id)
    role = await require_membre(row["maison_id"], current_user["id"])

    if not row.get("rotation_active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La rotation n'est pas activée sur cette activité",
        )

    ordre = _parse_ordre(row.get("rotation_ordre"))
    titulaire = ordre[int(row.get("rotation_index") or 0) % len(ordre)] if ordre else None
    if (
        role not in ("chef", "co_chef")
        and row["createur_id"] != current_user["id"]
        and current_user["id"] != titulaire
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire, le créateur ou le titulaire du tour peut passer au suivant",
        )

    updated = await _avancer_rotation(row, manque=False)
    return await _serialize_activite(updated)


@router.delete("/activites/{activite_id}")
async def delete_activite(activite_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_activite_or_404(activite_id)
    role = await require_membre(row["maison_id"], current_user["id"])

    if role not in ("chef", "co_chef") and row["createur_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le gestionnaire ou le créateur peut supprimer cette activité",
        )

    await database.execute(
        activite_assignations.delete().where(activite_assignations.c.activite_id == activite_id)
    )
    await database.execute(
        activite_participants.delete().where(activite_participants.c.activite_id == activite_id)
    )
    await database.execute(
        activite_sous_taches.delete().where(activite_sous_taches.c.activite_id == activite_id)
    )
    await database.execute(
        activite_commentaires.delete().where(activite_commentaires.c.activite_id == activite_id)
    )
    await database.execute(activites.delete().where(activites.c.id == activite_id))
    return {"message": "Activité supprimée"}


# ==================== ANNEXE V3 — Photo preuve ====================

@router.post("/activites/{activite_id}/preuve")
async def upload_preuve(
    activite_id: int,
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])

    url = await save_upload(image, "preuves")
    await database.execute(
        activites.update().where(activites.c.id == activite_id).values(preuve_url=url)
    )
    return {"preuve_url": url}


# ==================== ANNEXE V3 — Sous-tâches ====================

@router.get("/activites/{activite_id}/sous-taches")
async def list_sous_taches(activite_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])
    return await _sous_taches_for(activite_id)


@router.post("/activites/{activite_id}/sous-taches", status_code=status.HTTP_201_CREATED)
async def create_sous_tache(
    activite_id: int, data: SousTacheCreateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_activite_or_404(activite_id)
    await require_membre(row["maison_id"], current_user["id"])

    sous_tache_id = await database.execute(
        activite_sous_taches.insert().values(activite_id=activite_id, titre=data.titre, fait=False)
    )
    st = await database.fetch_one(
        activite_sous_taches.select().where(activite_sous_taches.c.id == sous_tache_id)
    )
    return {"id": st["id"], "titre": st["titre"], "fait": bool(st["fait"])}


@router.patch("/sous-taches/{sous_tache_id}")
async def update_sous_tache(
    sous_tache_id: int, data: SousTacheUpdateInput, current_user: dict = Depends(get_current_user)
):
    st = await database.fetch_one(
        activite_sous_taches.select().where(activite_sous_taches.c.id == sous_tache_id)
    )
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sous-tâche introuvable")

    activite = await _get_activite_or_404(st["activite_id"])
    await require_membre(activite["maison_id"], current_user["id"])

    values = {}
    if data.fait is not None:
        values["fait"] = bool(data.fait)
    if data.titre is not None:
        values["titre"] = data.titre
    if values:
        await database.execute(
            activite_sous_taches.update().where(activite_sous_taches.c.id == sous_tache_id).values(**values)
        )

    updated = await database.fetch_one(
        activite_sous_taches.select().where(activite_sous_taches.c.id == sous_tache_id)
    )
    return {"id": updated["id"], "titre": updated["titre"], "fait": bool(updated["fait"])}


@router.delete("/sous-taches/{sous_tache_id}")
async def delete_sous_tache(sous_tache_id: int, current_user: dict = Depends(get_current_user)):
    st = await database.fetch_one(
        activite_sous_taches.select().where(activite_sous_taches.c.id == sous_tache_id)
    )
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sous-tâche introuvable")

    activite = await _get_activite_or_404(st["activite_id"])
    await require_membre(activite["maison_id"], current_user["id"])

    await database.execute(activite_sous_taches.delete().where(activite_sous_taches.c.id == sous_tache_id))
    return {"message": "Sous-tâche supprimée"}
