"""Tâches planifiées en arrière-plan (APScheduler).

Historiquement, plusieurs effets de bord étaient déclenchés *à la lecture* :
- l'application des gages de tâches en retard (`GET /taches`),
- la génération des notifications d'anniversaire (`GET /notifications`).

Problèmes : deux lectures concurrentes pouvaient dédoubler une pénalité, et le
compteur de notifications relançait un scan complet à chaque appel. On déplace
donc ces effets ici, dans des jobs périodiques idempotents, et on les retire des
endpoints de lecture.
"""
import logging
from collections import defaultdict
from datetime import date

from app.database.database import database

logger = logging.getLogger(__name__)

# Instance unique du scheduler (créée au démarrage de l'app).
scheduler = None

# Cadences (modifiables) :
EFFETS_INTERVAL_MINUTES = 5   # gages de tâches
ANNIV_INTERVAL_HOURS = 1      # anniversaires (idempotent via clé jour)


async def appliquer_effets_toutes_maisons() -> None:
    """Applique les gages de tâches échus, pour toutes les maisons.

    Ne concerne que les TÂCHES (corvées ménagères) : leur rotation entre membres
    et le gage associé. Les activités (moments à vivre ensemble) n'ont pas de
    rotation, donc aucun effet périodique à leur appliquer.

    La fonction appelée est déjà protégée contre la concurrence (claim atomique
    de l'échéance), donc rejouer ce job est sans danger.
    """
    # Import différé : évite tout cycle d'import au chargement du module.
    from app.routers.taches import _appliquer_gage_taches_dues

    rows = await database.fetch_all("SELECT id FROM maisons")
    for r in rows:
        mid = r["id"]
        try:
            await _appliquer_gage_taches_dues(mid)
        except Exception as exc:  # noqa: BLE001 — un échec sur une maison ne bloque pas les autres
            logger.warning("Effets planifiés échoués pour la maison %s: %s", mid, exc)


async def generer_anniversaires_toutes_maisons() -> None:
    """Crée les notifications d'anniversaire du jour pour toutes les maisons.

    Idempotent : la clé `anniv:<uid>:<AAAA-MM-JJ>` empêche les doublons, donc on
    peut relancer ce job plusieurs fois par jour sans risque.
    """
    from app.services.notifications import notifier

    today = date.today()

    # Membres par maison (une seule requête, réutilisée pour tous les anniversaires).
    membres = defaultdict(list)
    for m in await database.fetch_all("SELECT maison_id, utilisateur_id FROM membres_maison"):
        membres[m["maison_id"]].append(m["utilisateur_id"])

    rows = await database.fetch_all(
        """
        SELECT DISTINCT u.id, u.nom, u.date_naissance, mm.maison_id
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE u.date_naissance IS NOT NULL
        """
    )
    for r in rows:
        dn = r["date_naissance"]
        try:
            d = dn if isinstance(dn, date) else date.fromisoformat(str(dn)[:10])
        except (ValueError, TypeError):
            continue
        if d.month == today.month and d.day == today.day:
            dest = membres.get(r["maison_id"], [])
            if not dest:
                continue
            await notifier(
                dest,
                type="anniversaire",
                titre="🎂 Anniversaire aujourd'hui",
                message=f"C'est l'anniversaire de {r['nom']} aujourd'hui ! 🎉",
                maison_id=r["maison_id"],
                lien="maison",
                cle=f"anniv:{r['id']}:{today.isoformat()}",
            )


def start_scheduler() -> None:
    """Démarre les jobs périodiques. Appelé depuis le lifespan de l'app."""
    global scheduler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        appliquer_effets_toutes_maisons,
        "interval",
        minutes=EFFETS_INTERVAL_MINUTES,
        id="effets_maisons",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        generer_anniversaires_toutes_maisons,
        "interval",
        hours=ANNIV_INTERVAL_HOURS,
        id="anniversaires",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("Scheduler démarré (effets: %smin, anniversaires: %sh)",
                EFFETS_INTERVAL_MINUTES, ANNIV_INTERVAL_HOURS)


def stop_scheduler() -> None:
    """Arrête proprement le scheduler (lifespan shutdown)."""
    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
        logger.info("Scheduler arrêté")
