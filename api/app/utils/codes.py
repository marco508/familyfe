"""Génération de code_invitation unique (8 caractères A-Z0-9) pour les maisons.

Utilise `secrets` (générateur cryptographique) plutôt que `random` : le code
sert de secret d'accès à une maison, il ne doit pas être prévisible.
"""
import secrets
import string

from app.database.database import database, maisons

# On retire les caractères ambigus (0/O, 1/I) pour la lisibilité humaine.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _random_code(length: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


async def generate_unique_code_invitation() -> str:
    """Génère un code d'invitation à 8 caractères, garanti unique en base."""
    for _ in range(50):
        code = _random_code()
        existing = await database.fetch_one(
            maisons.select().where(maisons.c.code_invitation == code)
        )
        if not existing:
            return code
    raise RuntimeError("Impossible de générer un code d'invitation unique")
