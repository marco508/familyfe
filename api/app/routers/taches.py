# app/routers/taches.py — Tâches domestiques (ANNEXE V4)
import json
from datetime import date, datetime
from datetime import time as dtime
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, pieces, taches, tache_pieces, tache_validations
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
from app.services.gage_effets import appliquer_effets, dumps_effets, parse_effets
from app.utils.formatting import mini_user

router = APIRouter(tags=["taches"])

VALID_FREQUENCES = {"ponctuel", "quotidien", "hebdo", "mensuel"}
VALID_ASSIGNATIONS = {"fixe", "rotation"}
VALID_STATUTS_TACHE = {"a_faire", "fait"}


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


def _next_weekday(d: date, weekday: int) -> date:
    """Prochaine date tombant sur `weekday` (0=lundi … 6=dimanche), STRICTEMENT
    après `d`. Ex. depuis un mercredi avec weekday=mercredi → mercredi suivant."""
    delta = (weekday - d.weekday() - 1) % 7 + 1
    return d + timedelta(days=delta)


def _prochaine_echeance_date(row: dict, base_date: date) -> Optional[date]:
    """Calcule la prochaine date d'échéance : si un jour-seuil
    (`echeance_jour_semaine`) est défini, on se cale dessus ; sinon on suit la
    fréquence (quotidien/hebdo/mensuel)."""
    wd = row.get("echeance_jour_semaine")
    if wd is not None:
        return _next_weekday(base_date, int(wd))
    return _next_date(base_date, row.get("frequence") or "ponctuel")


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


async def _pieces_for(tache_id: int) -> list:
    """Liste des pièces associées à une tâche (id, nom, type)."""
    rows = await database.fetch_all(
        """
        SELECT p.id, p.nom, p.type
        FROM tache_pieces tp JOIN pieces p ON p.id = tp.piece_id
        WHERE tp.tache_id = :tid
        ORDER BY p.nom
        """,
        values={"tid": tache_id},
    )
    return [dict(r) for r in rows]


async def _valider_pieces(maison_id: int, piece_ids) -> list:
    """Vérifie que chaque pièce appartient à la maison ; renvoie la liste
    dédupliquée. 400 si une pièce est introuvable dans la maison."""
    ids = list(dict.fromkeys(int(p) for p in (piece_ids or [])))
    if not ids:
        return []
    rows = await database.fetch_all(
        pieces.select().where((pieces.c.maison_id == maison_id) & (pieces.c.id.in_(ids)))
    )
    trouves = {r["id"] for r in rows}
    manquants = [i for i in ids if i not in trouves]
    if manquants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une ou plusieurs pièces sont introuvables dans cette maison",
        )
    return ids


async def _set_tache_pieces(tache_id: int, piece_ids) -> None:
    """Remplace l'ensemble des pièces associées à une tâche."""
    await database.execute(tache_pieces.delete().where(tache_pieces.c.tache_id == tache_id))
    for pid in dict.fromkeys(piece_ids or []):
        await database.execute(tache_pieces.insert().values(tache_id=tache_id, piece_id=pid))


async def _serialize_tache(row: dict) -> dict:
    data = dict(row)
    data["gage_actif"] = bool(data.get("gage_actif"))
    data["rotation_ordre"] = _parse_ordre(data.get("rotation_ordre"))
    titulaire_id = _titulaire_id(data)
    data["titulaire"] = await _mini_user_for(titulaire_id)
    periode = _periode_cle(data, date.today())
    data["fait_aujourdhui"] = await _fait_pour_periode(row["id"], periode)
    data["pieces"] = await _pieces_for(row["id"])
    data["gage_effets_echec"] = parse_effets(data.get("gage_effets_echec"))
    data["gage_effets_reussite"] = parse_effets(data.get("gage_effets_reussite"))
    return data


async def _programmer_periode_suivante(
    row: dict, avancer_rotation: bool = True, notifier_titulaire: bool = True
) -> None:
    """Programme la période suivante (échéance selon jour-seuil ou `frequence`),
    statut remis à `a_faire`.

    - `avancer_rotation=True` (défaut) : en rotation, passe au membre suivant.
    - `avancer_rotation=False` : garde le titulaire actuel (cas d'un gage en
      cours ou d'un oubli — la tâche « colle » au retardataire).
    """
    base = _parse_dt(row.get("prochaine_echeance"))
    base_date = base.date() if base else (_parse_date(row.get("echeance_date")) or date.today())
    next_date = _prochaine_echeance_date(row, base_date)
    next_dt = _combine_echeance(next_date, row.get("echeance_heure"))

    values = {"statut": "a_faire", "prochaine_echeance": next_dt}
    if next_date:
        values["echeance_date"] = next_date

    new_titulaire = None
    if avancer_rotation and (row.get("assignation") or "fixe") == "rotation":
        ordre = _parse_ordre(row.get("rotation_ordre"))
        if ordre:
            idx = int(row.get("rotation_index") or 0) % len(ordre)
            new_idx = (idx + 1) % len(ordre)
            values["rotation_index"] = new_idx
            new_titulaire = ordre[new_idx]

    await database.execute(taches.update().where(taches.c.id == row["id"]).values(**values))

    if not notifier_titulaire:
        return
    titulaire_final = new_titulaire if new_titulaire is not None else _titulaire_id(row)
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
            ponctuel = (row.get("frequence") or "ponctuel") == "ponctuel"
            # Claim atomique de CETTE échéance : on remet prochaine_echeance à
            # NULL uniquement si sa valeur est toujours celle qu'on a lue. Si un
            # autre appel concurrent (déclenché par une autre lecture) a déjà
            # traité cette échéance, le claim ne matche rien → on n'applique pas
            # la pénalité deux fois (TOCTOU supprimé).
            async with database.transaction():
                claimed = await database.fetch_one(
                    """
                    UPDATE taches SET prochaine_echeance = NULL
                    WHERE id = :id AND prochaine_echeance = :old
                    RETURNING id
                    """,
                    values={"id": row["id"], "old": row.get("prochaine_echeance")},
                )
                if claimed is None:
                    break  # échéance déjà traitée par un autre appel concurrent

                titulaire = _titulaire_id(row)
                gage_msg = ""
                if titulaire and row.get("gage_actif"):
                    # Pénalité de points (optionnelle, si configurée).
                    if int(row.get("points_penalite") or 0):
                        await ajuster_points(
                            maison_id, [titulaire], -int(row.get("points_penalite") or 0),
                            motif=f"tache:penalite:{row['id']}",
                        )
                    # Gage « corvée » cumulatif : 1er oubli → `gage_semaines` ;
                    # chaque oubli suivant → +1 semaine. Suivi en live.
                    restantes = int(row.get("gage_semaines_restantes") or 0)
                    nouveau = int(row.get("gage_semaines") or 2) if restantes == 0 else restantes + 1
                    await database.execute(
                        taches.update().where(taches.c.id == row["id"]).values(gage_semaines_restantes=nouveau)
                    )
                    row["gage_semaines_restantes"] = nouveau
                    gage_msg = f" Tu gardes la tâche : {nouveau} semaine(s) de corvée à assumer."
                if titulaire:
                    pen = row.get("penalite")
                    await notifier(
                        [titulaire],
                        type="tache",
                        titre="⏰ Tâche non faite",
                        message=(
                            f"« {row['titre']} » n'a pas été faite à temps."
                            + (f" Gage : {pen}." if pen else "")
                            + gage_msg
                        ),
                        maison_id=maison_id,
                        lien=f"tache:{row['id']}",
                    )

                # Effets de gage paramétrables (points/tâche/note) appliqués
                # automatiquement à l'oubli, en plus du gage « corvée » ci-dessus.
                if titulaire and row.get("gage_effets_echec"):
                    await appliquer_effets(
                        row.get("gage_effets_echec"),
                        maison_id=maison_id,
                        cibles=[titulaire],
                        source_titre=row["titre"],
                        createur_id=row.get("createur_id"),
                    )

                # Reprogramme la période suivante. Avec un gage actif, la tâche
                # RESTE au retardataire (avancer_rotation=False) : elle « colle »
                # jusqu'à ce qu'il purge son gage. Sans gage, comportement d'avant
                # (on passe au suivant). Ponctuelle : reste à NULL.
                if not ponctuel:
                    avancer = not bool(row.get("gage_actif"))
                    await _programmer_periode_suivante(
                        row, avancer_rotation=avancer, notifier_titulaire=False
                    )

            if ponctuel:
                break

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
async def list_taches(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])

    # L'auto-gage des tâches en retard est désormais appliqué par le scheduler
    # (app/services/scheduler.py), plus à la lecture.
    rows = await database.fetch_all(
        taches.select().where(taches.c.maison_id == maison_id)
        .order_by(taches.c.date_creation.desc()).limit(limit).offset(offset)
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

    # Pièces : accepte une liste (piece_ids, une tâche peut couvrir plusieurs
    # pièces) ou l'ancien champ unique (piece_id). Toutes doivent appartenir à
    # la maison. `piece_id` (colonne legacy) = 1re pièce, pour compat.
    piece_ids_input = (
        data.piece_ids if data.piece_ids is not None
        else ([data.piece_id] if data.piece_id is not None else [])
    )
    piece_ids = await _valider_pieces(maison_id, piece_ids_input)
    piece_principale = piece_ids[0] if piece_ids else None

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

    # Échéance : soit une date explicite, soit calée sur un jour-seuil
    # (echeance_jour_semaine) → prochaine occurrence de ce jour.
    echeance_date = data.echeance_date
    if echeance_date is None and data.echeance_jour_semaine is not None:
        echeance_date = _next_weekday(date.today(), int(data.echeance_jour_semaine))
    prochaine_echeance = _combine_echeance(echeance_date, data.echeance_heure)

    tache_id = await database.execute(
        taches.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            description=data.description,
            piece_id=piece_principale,
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
            gage_semaines=int(data.gage_semaines or 2),
            gage_semaines_restantes=0,
            gage_effets_echec=dumps_effets(data.gage_effets_echec),
            gage_effets_reussite=dumps_effets(data.gage_effets_reussite),
            echeance_date=echeance_date,
            echeance_heure=data.echeance_heure,
            echeance_jour_semaine=data.echeance_jour_semaine,
            statut="a_faire",
            prochaine_echeance=prochaine_echeance,
            createur_id=current_user["id"],
        )
    )

    # Associe les pièces (relation multi-pièces).
    if piece_ids:
        await _set_tache_pieces(tache_id, piece_ids)

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
    # Pièces : réaffectation multi-pièces (piece_ids) ou champ unique (piece_id).
    piece_ids_update = None
    if data.piece_ids is not None:
        piece_ids_update = await _valider_pieces(row["maison_id"], data.piece_ids)
        values["piece_id"] = piece_ids_update[0] if piece_ids_update else None
    elif data.piece_id is not None:
        piece = await database.fetch_one(
            pieces.select().where((pieces.c.id == data.piece_id) & (pieces.c.maison_id == row["maison_id"]))
        )
        if not piece:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pièce introuvable dans cette maison")
        values["piece_id"] = data.piece_id
        piece_ids_update = [data.piece_id]
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
    if data.gage_semaines is not None:
        values["gage_semaines"] = int(data.gage_semaines)
    if data.gage_effets_echec is not None:
        values["gage_effets_echec"] = dumps_effets(data.gage_effets_echec)
    if data.gage_effets_reussite is not None:
        values["gage_effets_reussite"] = dumps_effets(data.gage_effets_reussite)
    if data.echeance_jour_semaine is not None:
        values["echeance_jour_semaine"] = int(data.echeance_jour_semaine)
    if data.statut is not None:
        if data.statut not in VALID_STATUTS_TACHE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Statut invalide (attendu: 'a_faire' ou 'fait')",
            )
        values["statut"] = data.statut

    if (
        data.echeance_date is not None
        or data.echeance_heure is not None
        or data.echeance_jour_semaine is not None
    ):
        new_heure = data.echeance_heure if data.echeance_heure is not None else row.get("echeance_heure")
        if data.echeance_date is not None:
            new_date = data.echeance_date
            values["echeance_date"] = data.echeance_date
        elif data.echeance_jour_semaine is not None:
            # Jour-seuil fourni sans date : cale l'échéance sur la prochaine
            # occurrence de ce jour.
            new_date = _next_weekday(date.today(), int(data.echeance_jour_semaine))
            values["echeance_date"] = new_date
        else:
            new_date = row.get("echeance_date")
        if data.echeance_heure is not None:
            values["echeance_heure"] = data.echeance_heure
        values["prochaine_echeance"] = _combine_echeance(_parse_date(new_date), new_heure)

    if values:
        await database.execute(taches.update().where(taches.c.id == tache_id).values(**values))

    # Réaffecte les pièces si une nouvelle liste a été fournie.
    if piece_ids_update is not None:
        await _set_tache_pieces(tache_id, piece_ids_update)

    updated = await _get_tache_or_404(tache_id)
    return await _serialize_tache(updated)


@router.delete("/taches/{tache_id}")
async def delete_tache(tache_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_tache_or_404(tache_id)
    await require_gestion(row["maison_id"], current_user["id"])
    async with database.transaction():
        await database.execute(tache_pieces.delete().where(tache_pieces.c.tache_id == tache_id))
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

    # Validation + récompense + changement de statut, atomiques. L'insertion de
    # la validation s'appuie sur la contrainte d'unicité (tache_id, periode_cle) :
    # sous concurrence, la 2e tentative échoue au niveau base et est convertie en
    # 400 — plus de double récompense (le pré-check ci-dessus ne fermait pas le
    # TOCTOU à lui seul).
    async with database.transaction():
        try:
            await database.execute(
                tache_validations.insert().values(
                    tache_id=tache_id, utilisateur_id=current_user["id"], periode_cle=periode
                )
            )
        except Exception as exc:  # noqa: BLE001 — on ne mappe que les violations d'unicité
            msg = str(exc).lower()
            if any(k in msg for k in ("unique", "constraint", "duplicate")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cette tâche a déjà été validée pour cette période",
                )
            raise

        if titulaire and row.get("gage_actif") and int(row.get("points_recompense") or 0):
            await ajuster_points(
                row["maison_id"], [titulaire], int(row.get("points_recompense") or 0),
                motif=f"tache:reussite:{tache_id}",
            )

        # Effets de gage paramétrables appliqués automatiquement à la réussite.
        if titulaire and row.get("gage_effets_reussite"):
            await appliquer_effets(
                row.get("gage_effets_reussite"),
                maison_id=row["maison_id"],
                cibles=[titulaire],
                source_titre=row["titre"],
                createur_id=row.get("createur_id"),
            )

        if frequence == "ponctuel":
            await database.execute(
                taches.update().where(taches.c.id == tache_id).values(statut="fait", prochaine_echeance=None)
            )
        else:
            restantes = int(row.get("gage_semaines_restantes") or 0)
            if restantes > 0:
                # Le titulaire sert son gage : il vient de faire la corvée, on
                # décrémente d'une semaine. Tant qu'il reste des semaines, la tâche
                # lui RESTE (rotation figée) ; une fois le gage purgé (0), la
                # rotation repart normalement au membre suivant.
                nouveau = restantes - 1
                await database.execute(
                    taches.update().where(taches.c.id == tache_id).values(gage_semaines_restantes=nouveau)
                )
                row["gage_semaines_restantes"] = nouveau
                await _programmer_periode_suivante(row, avancer_rotation=(nouveau == 0))
            else:
                await _programmer_periode_suivante(row, avancer_rotation=True)

    updated = await _get_tache_or_404(tache_id)
    return await _serialize_tache(updated)
