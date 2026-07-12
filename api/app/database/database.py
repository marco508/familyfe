# app/database/database.py
"""
Point d'entrée unique pour la base de données.
Importe tout depuis tables.py — ne redéfinit aucune table ici.
"""
# Réexporte les instances UNIQUES définies dans connection.py
# (ne recrée ni database ni engine ici).
from .connection import metadata, database, engine
from .tables import (
    utilisateurs,
    maisons,
    membres_maison,
    activites,
    activite_assignations,
    evenements,
    votes,
    vote_options,
    vote_bulletins,
    notifications,
    # ANNEXE V3
    courses_items,
    depenses,
    depense_parts,
    repas,
    messages,
    activite_commentaires,
    boutique_recompenses,
    recompense_echanges,
    points_log,
    defis,
    defi_participants,
    activite_sous_taches,
    evenement_reponses,
    # ANNEXE V4
    pieces,
    regles,
    taches,
    tache_validations,
    activite_participants,
)

__all__ = [
    "database",
    "engine",
    "metadata",
    "utilisateurs",
    "maisons",
    "membres_maison",
    "activites",
    "activite_assignations",
    "evenements",
    "votes",
    "vote_options",
    "vote_bulletins",
    "notifications",
    # ANNEXE V3
    "courses_items",
    "depenses",
    "depense_parts",
    "repas",
    "messages",
    "activite_commentaires",
    "boutique_recompenses",
    "recompense_echanges",
    "points_log",
    "defis",
    "defi_participants",
    "activite_sous_taches",
    "evenement_reponses",
    # ANNEXE V4
    "pieces",
    "regles",
    "taches",
    "tache_validations",
    "activite_participants",
]
