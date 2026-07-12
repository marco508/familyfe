"""ANNEXE V4 — Rappel des règles de la maison.

Quand un utilisateur rejoint une maison, est ajouté par la gestion, ou est
marqué visiteur, on remet `regles_vues_le=NULL` (il doit relire les règles)
et on lui envoie une notification de rappel.
"""
from app.database.database import database, membres_maison
from app.services.notifications import notifier


async def rappeler_regles(maison_id: int, utilisateur_id: int) -> None:
    """Remet `regles_vues_le` à NULL et notifie l'utilisateur qu'il doit
    (re)découvrir les règles de la maison."""
    await database.execute(
        membres_maison.update()
        .where(
            (membres_maison.c.maison_id == maison_id)
            & (membres_maison.c.utilisateur_id == utilisateur_id)
        )
        .values(regles_vues_le=None)
    )
    await notifier(
        [utilisateur_id],
        type="regle",
        titre="📜 Découvre les règles de la maison",
        message="Prends un moment pour lire les règles de la maison avant de commencer.",
        maison_id=maison_id,
        lien="regles",
    )
