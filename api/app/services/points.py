"""Ajustement des points d'un membre — écrit systématiquement une ligne dans
`points_log` (ANNEXE V3) en plus de mettre à jour `membres_maison.points`.

Utilisé par : gage d'activité, rotation des tâches, échanges boutique, défis.
"""
from typing import Iterable

from app.database.database import database, points_log


async def ajuster_points(
    maison_id: int,
    user_ids: Iterable[int],
    delta: int,
    motif: str = "ajustement",
) -> None:
    """Ajoute `delta` points au score de chaque membre (dans cette maison) et
    journalise chaque mouvement dans `points_log`.

    L'UPDATE du solde et l'INSERT du journal sont enveloppés dans une même
    transaction : le solde `membres_maison.points` ne peut plus diverger de
    `points_log`. L'`UPDATE ... points + :delta` reste atomique au niveau ligne
    (pas de lost-update sur l'incrément lui-même).
    """
    if not delta:
        return
    async with database.transaction():
        for uid in set(user_ids):
            await database.execute(
                """
                UPDATE membres_maison SET points = points + :delta
                WHERE maison_id = :mid AND utilisateur_id = :uid
                """,
                values={"delta": delta, "mid": maison_id, "uid": uid},
            )
            await database.execute(
                points_log.insert().values(
                    maison_id=maison_id, utilisateur_id=uid, delta=delta, motif=motif
                )
            )
