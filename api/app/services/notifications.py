"""Génération des notifications in-app (centre de notifications de FamyLife).

Note : les notifications « push » réelles nécessitent un build de développement
(expo-notifications ne gère pas le push distant dans Expo Go sur SDK 54). Ici on
persiste les notifications côté serveur ; l'app les récupère (badge + centre de
notifications) et planifie des rappels locaux pour les activités/événements datés.
"""
import asyncio
import logging
from typing import Iterable, List, Optional, Set

from app.database.database import database, notifications, utilisateurs

logger = logging.getLogger(__name__)

# Garde une référence aux tâches push détachées le temps de leur exécution
# (sinon le garbage collector peut les annuler prématurément).
_background_tasks: set = set()


# ==================== ANNEXE V8 — Catégories de notification ====================
#
# Source unique de vérité du mapping type → catégorie. Les `type` sont un détail
# d'implémentation (une quinzaine, techniques) ; les CATÉGORIES sont ce que
# l'utilisateur voit et coupe dans ses réglages (8, métier). Tout `type` émis
# DOIT figurer ici, sinon il échappe silencieusement aux préférences.
#
# Distinction métier volontaire, à ne pas « simplifier » :
#   - `tache` = corvée ménagère (vaisselle, poubelles)      → corvees
#   - `activite` = moment à vivre ensemble (restau, ciné)   → sorties
# Ce sont deux notions différentes : les fondre reviendrait à annoncer un
# barbecue comme une corvée.

CATEGORIES: List[str] = [
    "corvees",
    "sorties",
    "decisions",
    "depenses",
    "courses",
    "chat",
    "jeu",
    "foyer",
]

CATEGORIE_PAR_TYPE = {
    # Corvées ménagères (et leur rotation entre membres).
    "tache": "corvees",
    # `rotation` n'est plus ÉMIS (les activités n'ont plus de rotation, et les
    # tâches notifient en type `tache`), mais des notifications historiques de ce
    # type existent déjà en base : on garde le mapping pour qu'elles restent
    # classées dans la bonne catégorie au lieu de tomber en fail-open.
    "rotation": "corvees",
    # Moments à vivre ensemble + agenda.
    "activite": "sorties",
    "evenement": "sorties",
    # Vie démocratique du foyer.
    "vote": "decisions",
    "regle": "decisions",
    # Argent.
    "depense": "depenses",
    # Ravitaillement.
    "course": "courses",
    "repas": "courses",
    # Discussion.
    "chat": "chat",
    # Ludique (points, récompenses, défis).
    "boutique": "jeu",
    "defi": "jeu",
    # Vie du foyer lui-même (membres, rôles, pièces, anniversaires).
    "maison": "foyer",
    "piece": "foyer",
    "anniversaire": "foyer",
}


def parse_categories(brut: Optional[str]) -> List[str]:
    """CSV stocké en base → liste de catégories valides (ignore l'inconnu)."""
    if not brut:
        return []
    return [c for c in str(brut).split(",") if c in CATEGORIES]


def serialize_categories(valeurs: Iterable[str]) -> str:
    """Liste → CSV déterministe (dédoublonné, ordre de CATEGORIES)."""
    choisies = set(valeurs)
    return ",".join([c for c in CATEGORIES if c in choisies])


async def _retirer_desabonnes(cibles: Set[int], type: str) -> Set[int]:
    """Retire les destinataires ayant désactivé la catégorie de ce `type`.

    Filtrage CENTRAL : appelé par `notifier()`, donc valable pour tous les
    routeurs et — c'est le point important — appliqué AVANT `_schedule_push`,
    si bien qu'une catégorie coupée ne déclenche ni notification in-app ni push.

    Un `type` non mappé n'est jamais filtré : on préfère une notification de trop
    qu'une notification perdue en silence (fail-open assumé).
    """
    categorie = CATEGORIE_PAR_TYPE.get(type)
    if not categorie or not cibles:
        return cibles

    rows = await database.fetch_all(
        utilisateurs.select()
        .with_only_columns(utilisateurs.c.id, utilisateurs.c.notif_desactivees)
        .where(utilisateurs.c.id.in_(list(cibles))),
    )
    refus = {r["id"] for r in rows if categorie in parse_categories(r["notif_desactivees"])}
    return cibles - refus


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

    # Préférences par catégorie (ANNEXE V8) : appliquées ICI et nulle part
    # ailleurs. Les routeurs n'ont pas à connaître les réglages de l'utilisateur.
    cibles = await _retirer_desabonnes(cibles, type)
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
