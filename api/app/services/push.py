"""Envoi best-effort de notifications push via l'API Expo (ANNEXE V3).

Limite connue : le push distant ne fonctionne qu'en dev build / standalone
(pas dans Expo Go). Le centre de notifications in-app (`notifications`) reste
la source de vérité ; cet envoi est un bonus qui ne doit jamais faire échouer
l'appelant (toute exception est avalée et loggée).

Améliorations :
- découpage par lots de 100 (limite de l'API Expo, sinon la requête est rejetée
  en bloc au-delà) ;
- lecture de la réponse pour purger les tokens morts (`DeviceNotRegistered`),
  qui sinon s'accumulent indéfiniment en base.
"""
import logging
from typing import Iterable, List, Optional

from app.database.database import database, utilisateurs

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_BATCH = 100  # limite de messages par requête Expo


async def _purge_tokens(tokens: List[str]) -> None:
    """Détache les push_token invalides des utilisateurs concernés."""
    if not tokens:
        return
    try:
        await database.execute(
            utilisateurs.update()
            .where(utilisateurs.c.push_token.in_(tokens))
            .values(push_token=None)
        )
        logger.info("Purge de %d push_token invalide(s)", len(tokens))
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("Purge des push_token échouée (ignorée): %s", exc)


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

        dead: List[str] = []
        async with httpx.AsyncClient(timeout=5.0) as client:
            for start in range(0, len(tokens), _BATCH):
                batch = tokens[start:start + _BATCH]
                payload = [
                    {"to": token, "title": titre, "body": message or "", "sound": "default"}
                    for token in batch
                ]
                resp = await client.post(EXPO_PUSH_URL, json=payload)
                # Expo répond 200 même en cas d'erreur par-message : il faut lire
                # le corps. Les tickets sont dans le même ordre que l'envoi.
                try:
                    tickets = resp.json().get("data", [])
                except Exception:  # noqa: BLE001 — réponse non JSON
                    tickets = []
                for token, ticket in zip(batch, tickets):
                    if (
                        isinstance(ticket, dict)
                        and ticket.get("status") == "error"
                        and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
                    ):
                        dead.append(token)

        await _purge_tokens(dead)
    except Exception as exc:  # noqa: BLE001 — best-effort, ne doit jamais casser l'appelant
        logger.warning("Envoi push Expo échoué (best-effort, ignoré): %s", exc)
