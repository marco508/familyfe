"""Helpers de requêtes réutilisables (factorisation des patterns dupliqués).

Évite de réimplémenter le même `SELECT id, nom, image` (createur / auteur /
assigné) dans chaque router, et fournit une variante *groupée* pour supprimer
les N+1 dans les sérialiseurs de liste.
"""
from typing import Dict, Iterable, List, Optional

from app.database.database import database, utilisateurs
from app.utils.formatting import mini_user


async def fetch_mini_user(user_id: Optional[int]) -> Optional[dict]:
    """Vue minimale (id, nom, image) d'un utilisateur, ou None."""
    if user_id is None:
        return None
    row = await database.fetch_one(
        "SELECT id, nom, image FROM utilisateurs WHERE id = :uid",
        values={"uid": user_id},
    )
    return mini_user(row) if row else None


async def fetch_mini_users(user_ids: Iterable[int]) -> Dict[int, dict]:
    """Charge plusieurs utilisateurs en UNE requête, indexés par id.

    À utiliser dans les sérialiseurs de liste pour éviter un SELECT par ligne
    (N+1) : on collecte tous les ids, un seul appel, puis on regroupe en mémoire.
    """
    ids: List[int] = list({uid for uid in user_ids if uid is not None})
    if not ids:
        return {}
    rows = await database.fetch_all(
        utilisateurs.select().with_only_columns(
            utilisateurs.c.id, utilisateurs.c.nom, utilisateurs.c.image
        ).where(utilisateurs.c.id.in_(ids))
    )
    return {r["id"]: mini_user(r) for r in rows}
