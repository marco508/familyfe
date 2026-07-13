"""Génération des notifications in-app (centre de notifications de FamyLife).

Note : les notifications « push » réelles nécessitent un build de développement
(expo-notifications ne gère pas le push distant dans Expo Go sur SDK 54). Ici on
persiste les notifications côté serveur ; l'app les récupère (badge + centre de
notifications) et planifie des rappels locaux pour les activités/événements datés.
"""
import asyncio
import logging
from typing import Iterable, List, Optional

from app.database.database import database, notifications

logger = logging.getLogger(__name__)

# Garde une référence aux tâches push détachées le temps de leur exécution
# (sinon le garbage collector peut les annuler prématurément).
_background_tasks: set = set()


async def membres_ids(maison_id: int) -> List[int]:
    rows = await database.fetch_all(
        "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid",
        values={"mid": maison_id},
    )
    return [r["utilisateur_id"] for r in rows]


async def notifier(
    user_ids: Iterable[int],
    *,
    type: str,
    titre: str,
    message: Optional[str] = None,
    maison_id: Optional[int] = None,
    lien: Optional[str] = None,
    cle: Optional[str] = None,
    exclure: Optional[int] = None,
) -> None:
    """Crée une notification pour chaque destinataire.

    `cle` (optionnelle) sert de clé d'idempotence : si une notification avec la
    même clé existe déjà pour ce destinataire, on ne la recrée pas (utile pour
    les anniversaires, générés à chaque consultation).

    En plus de la notification in-app (source de vérité), tente un envoi push
    Expo best-effort (ANNEXE V3) — voir `app.services.push`.
    """
    cibles = {uid for uid in user_ids if not (exclure is not None and uid == exclure)}
    if not cibles:
        return

    # Idempotence : une seule requête pour connaître les destinataires qui ont
    # déjà cette `cle` (au lieu d'un SELECT par destinataire — évite un N+1).
    if cle:
        existing_rows = await database.fetch_all(
            notifications.select()
            .with_only_columns(notifications.c.utilisateur_id)
            .where((notifications.c.cle == cle) & (notifications.c.utilisateur_id.in_(list(cibles)))),
        )
        deja = {r["utilisateur_id"] for r in existing_rows}
        cibles -= deja

    destinataires = list(cibles)
    if not destinataires:
        return

    await database.execute_many(
        notifications.insert(),
        [
            {
                "utilisateur_id": uid,
                "maison_id": maison_id,
                "type": type,
                "titre": titre,
                "message": message,
                "lien": lien,
                "cle": cle,
            }
            for uid in destinataires
        ],
    )

    # Push best-effort, détaché de la requête : on n'attend pas l'API Expo
    # (jusqu'à 5s) avant de répondre au client.
    _schedule_push(destinataires, titre, message)


def _schedule_push(destinataires: List[int], titre: str, message: Optional[str]) -> None:
    """Planifie l'envoi push en tâche de fond (fire-and-forget)."""
    try:
        from app.services.push import envoyer_push

        task = asyncio.create_task(envoyer_push(destinataires, titre, message))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
    except RuntimeError:
        # Pas de boucle asyncio (contexte de test/sync) : on ignore le push.
        logger.debug("Pas de boucle asyncio active, push ignoré")


async def notifier_maison(
    maison_id: int,
    *,
    type: str,
    titre: str,
    message: Optional[str] = None,
    lien: Optional[str] = None,
    cle: Optional[str] = None,
    exclure: Optional[int] = None,
) -> None:
    """Notifie tous les membres d'une maison (option: exclure l'auteur)."""
    ids = await membres_ids(maison_id)
    await notifier(
        ids,
        type=type,
        titre=titre,
        message=message,
        maison_id=maison_id,
        lien=lien,
        cle=cle,
        exclure=exclure,
    )
