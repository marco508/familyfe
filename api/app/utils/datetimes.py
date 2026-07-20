"""Normalisation des dates/heures à la frontière de l'API.

Contexte : les colonnes horodatées du schéma sont des `TIMESTAMP` SANS fuseau
(naïfs). Le client mobile, lui, envoie de l'UTC via `Date.toISOString()`, ce qui
produit des chaînes suffixées `Z` (ex. « 2026-06-30T22:00:00.000Z »).

Deux incompatibilités en découlent, invisibles sur SQLite (typage dynamique,
tout est du texte) mais fatales sur Postgres via asyncpg :
  1. Filtrer une colonne TIMESTAMP avec un paramètre **texte**
     → « operator does not exist / invalid input … got 'str' ».
  2. Écrire un datetime **avec fuseau** dans une colonne naïve
     → asyncpg attend un datetime naïf.

`naive_utc` résout les deux : il accepte une chaîne ISO (y compris `Z`), un
`datetime` (naïf ou aware) ou `None`, et renvoie toujours un `datetime` NAÏF
exprimé en UTC — la forme qu'attendent les colonnes du schéma.
"""
from datetime import datetime, timezone
from typing import Optional, Union


def naive_utc(value: Union[str, datetime, None]) -> Optional[datetime]:
    if value is None:
        return None

    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        # `Date.toISOString()` finit par 'Z' ; fromisoformat l'accepte depuis
        # Python 3.11, mais on le remplace pour rester robuste sur < 3.11.
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(s)
        except ValueError:
            # Dernier recours : une date seule (« 2026-06-30 »).
            value = datetime.fromisoformat(s[:10])

    if isinstance(value, datetime) and value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)

    return value
