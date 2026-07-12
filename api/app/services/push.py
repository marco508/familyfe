"""Envoi best-effort de notifications push via l'API Expo (ANNEXE V3).

Limite connue : le push distant ne fonctionne qu'en dev build / standalone
(pas dans Expo Go). Le centre de notifications in-app (`notifications`) reste
la source de vérité ; cet envoi est un bonus qui ne doit jamais faire échouer
l'appelant (toute exception est avalée et loggée).
"""
import logging
from typing import Iterable, Optional

from app.database.database import database, utilisateurs

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def envoyer_push(user_ids: Iterable[int], titre: str, message: Optional[str] = None) -> None:
    """Envoie une notification push Expo aux utilisateurs ayant un push_token
    enregistré. Best-effort : n'importe quelle erreur (réseau, timeout...) est
    absorbée sans propager d'exception."""
    ids = list({uid for uid in user_ids if uid is not None})
    if not ids:
        return
    try:
        import httpx  # import différé : optionnel si non installé en dev

        rows = await database.fetch_all(
            utilisateurs.select().where(utilisateurs.c.id.in_(ids))
        )
        tokens = [r["push_token"] for r in rows if r["push_token"]]
        if not tokens:
            return

        payload = [
            {"to": token, "title": titre, "body": message or "", "sound": "default"}
            for token in tokens
        ]
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(EXPO_PUSH_URL, json=payload)
    except Exception as exc:  # noqa: BLE001 — best-effort, ne doit jamais casser l'appelant
        logger.warning("Envoi push Expo échoué (best-effort, ignoré): %s", exc)
