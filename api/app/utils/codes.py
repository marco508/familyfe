"""Génération de code_invitation unique (6 caractères A-Z0-9) pour les maisons."""
import random
import string

from app.database.database import database, maisons

_ALPHABET = string.ascii_uppercase + string.digits


def _random_code(length: int = 6) -> str:
    return "".join(random.choices(_ALPHABET, k=length))


async def generate_unique_code_invitation() -> str:
    """Génère un code d'invitation à 6 caractères, garanti unique en base."""
    for _ in range(50):
        code = _random_code()
        existing = await database.fetch_one(
            maisons.select().where(maisons.c.code_invitation == code)
        )
        if not existing:
            return code
    raise RuntimeError("Impossible de générer un code d'invitation unique")
