"""Génération des notifications in-app (centre de notifications de FamyLife).

Note : les notifications « push » réelles nécessitent un build de développement
(expo-notifications ne gère pas le push distant dans Expo Go sur SDK 54). Ici on
persiste les notifications côté serveur ; l'app les récupère (badge + centre de
notifications) et planifie des rappels locaux pour les activités/événements datés.
"""
from typing import Iterable, List, Optional

from app.database.database import database, membres_maison, notifications


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
    destinataires = []
    for uid in set(user_ids):
        if exclure is not None and uid == exclure:
            continue
        if cle:
            existing = await database.fetch_one(
                "SELECT id FROM notifications WHERE utilisateur_id = :uid AND cle = :cle",
                values={"uid": uid, "cle": cle},
            )
            if existing:
                continue
        await database.execute(
            notifications.insert().values(
                utilisateur_id=uid,
                maison_id=maison_id,
                type=type,
                titre=titre,
                message=message,
                lien=lien,
                cle=cle,
            )
        )
        destinataires.append(uid)

    if destinataires:
        try:
            from app.services.push import envoyer_push

            await envoyer_push(destinataires, titre, message)
        except Exception:  # noqa: BLE001 — best-effort, ne doit jamais casser l'appelant
            pass


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
