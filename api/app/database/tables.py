"""
Définition des tables avec SQLAlchemy Core.
Ces tables sont utilisées pour les requêtes dans les routes.
Source unique de vérité — database.py importe depuis ici.
"""
from sqlalchemy import (
    Table, Column, Integer, String, ForeignKey, Date, TIMESTAMP,
    Text, Boolean, Float, func, UniqueConstraint,
)
from .connection import metadata


# ==================== UTILISATEURS ====================

utilisateurs = Table(
    "utilisateurs",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("nom", String, nullable=False),
    Column("email", String, unique=True, nullable=False, index=True),
    Column("telephone", String, unique=True, nullable=True, index=True),
    Column("mot_de_passe_hash", String, nullable=False),
    Column("image", String, nullable=True),
    # Date de naissance (optionnelle) — sert à célébrer les anniversaires.
    Column("date_naissance", Date, nullable=True),
    # Jeton Expo push (best-effort, dev build uniquement — voir ANNEXE V3).
    Column("push_token", String, nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)


# ==================== MAISONS ====================

maisons = Table(
    "maisons",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("nom", String, nullable=False),
    Column("code_invitation", String, unique=True, nullable=False, index=True),
    Column("chef_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("emoji", String, nullable=True, server_default="🏠"),
    Column("couleur", String, nullable=True, server_default="#FF4E9B"),
    # ─── ANNEXE V4 — Adresse & logement ─────────────────────────────────────
    Column("type_logement", String, nullable=False, server_default="maison"),  # maison|appartement
    Column("adresse", String, nullable=True),
    Column("complement", String, nullable=True),   # bâtiment/résidence
    Column("code_postal", String, nullable=True),
    Column("ville", String, nullable=True),
    Column("pays", String, nullable=True),
    Column("etage", String, nullable=True),
    Column("numero_appartement", String, nullable=True),
    Column("digicode", String, nullable=True),
    Column("interphone", String, nullable=True),
    Column("acces", Text, nullable=True),           # instructions d'accès (texte libre)
    Column("surface", Float, nullable=True),        # m²
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

membres_maison = Table(
    "membres_maison",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False, index=True),
    # 'chef' | 'co_chef' | 'chef_temporaire' | 'membre' | 'visiteur'
    Column("role", String, nullable=False, server_default="membre"),
    # Score cumulé du membre dans la maison (gagné/perdu via les gages d'activités).
    Column("points", Integer, nullable=False, server_default="0"),
    # Profil enfant : restreint certaines actions (créer/clore vote, gestion, validation récompenses).
    Column("est_enfant", Boolean, nullable=False, server_default="0"),
    # ─── ANNEXE V4 — Famille, chef temporaire, visiteurs, règles ───────────
    Column("lien_famille", String, nullable=True),   # pere|mere|enfant|frere|soeur|conjoint|autre
    Column("role_expire_le", TIMESTAMP, nullable=True),    # chef_temporaire
    Column("visite_expire_le", TIMESTAMP, nullable=True),  # visiteur
    Column("regles_vues_le", TIMESTAMP, nullable=True),    # dernière lecture des règles
    Column("date_ajout", TIMESTAMP, server_default=func.now()),
    UniqueConstraint("maison_id", "utilisateur_id", name="unique_membre_maison"),
)


# ==================== ACTIVITÉS ====================

activites = Table(
    "activites",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("description", Text, nullable=True),
    Column("statut", String, nullable=False, server_default="a_faire"),  # a_faire|en_cours|termine
    Column("date_echeance", Date, nullable=True),
    Column("heure_echeance", String, nullable=True),  # "HH:MM" — activité à faire ensemble à une heure
    Column("rappel", Boolean, nullable=False, server_default="1"),  # notifier les membres/assignés
    # ─── Planning / rotation des tours (paramétrable) ──────────────────────
    # Ex : le ménage tourne entre plusieurs membres ; si le tour n'est pas fait
    # dans le délai, il passe automatiquement au membre suivant (relais).
    Column("rotation_active", Boolean, nullable=False, server_default="0"),
    Column("rotation_ordre", Text, nullable=True),          # JSON: [user_id, ...] ordre des tours
    Column("rotation_index", Integer, nullable=False, server_default="0"),
    Column("rotation_delai_jours", Integer, nullable=False, server_default="0"),
    Column("rotation_echeance", TIMESTAMP, nullable=True),  # échéance du tour courant
    # ─── Système de gage (optionnel, activable par activité) ───────────────
    # Si gage_actif : l'activité réussie octroie une récompense (+points_recompense)
    # aux assignés, l'échec applique un gage/pénalité (-points_penalite).
    Column("gage_actif", Boolean, nullable=False, server_default="0"),
    Column("penalite", Text, nullable=True),      # description du gage/pénalité si échec
    Column("recompense", Text, nullable=True),    # description de la récompense si réussite
    Column("points_penalite", Integer, nullable=False, server_default="0"),
    Column("points_recompense", Integer, nullable=False, server_default="0"),
    # 'en_attente' | 'reussi' | 'echoue'
    Column("gage_resultat", String, nullable=False, server_default="en_attente"),
    # 'aucune' | 'quotidien' | 'hebdo' | 'mensuel' — recrée automatiquement la
    # prochaine occurrence quand l'activité passe 'termine' (ou gage réussi).
    Column("recurrence", String, nullable=False, server_default="aucune"),
    # Photo "preuve" (avant/après) uploadée via /activites/{id}/preuve.
    Column("preuve_url", String, nullable=True),
    # ANNEXE V4 — activité sociale : maison entière ou liste de participants restreinte.
    Column("visibilite", String, nullable=False, server_default="maison"),  # maison|participants
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ON DELETE CASCADE géré au niveau app (SQLite ne l'applique pas par défaut
# sans PRAGMA foreign_keys=ON) : voir routers/activites.py & maisons.py.
activite_assignations = Table(
    "activite_assignations",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("activite_id", Integer, ForeignKey("activites.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False, index=True),
    UniqueConstraint("activite_id", "utilisateur_id", name="unique_activite_assignation"),
)

# ANNEXE V4 — participants d'une activité sociale (visibilite='participants').
activite_participants = Table(
    "activite_participants",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("activite_id", Integer, ForeignKey("activites.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False, index=True),
    UniqueConstraint("activite_id", "utilisateur_id", name="unique_activite_participant"),
)


# ==================== ÉVÉNEMENTS (agenda) ====================

evenements = Table(
    "evenements",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("description", Text, nullable=True),
    Column("date_debut", TIMESTAMP, nullable=False),
    Column("date_fin", TIMESTAMP, nullable=True),
    Column("toute_la_journee", Boolean, nullable=False, server_default="false"),
    Column("lieu", String, nullable=True),
    Column("couleur", String, nullable=False, server_default="#7B5CFF"),
    # 'aucune' | 'hebdo' | 'mensuel' (indicatif — prochaines occurrences calculées
    # côté client ou via génération simple côté serveur).
    Column("recurrence", String, nullable=False, server_default="aucune"),
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)


# ==================== VOTES ====================

votes = Table(
    "votes",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("question", String, nullable=False),
    Column("description", Text, nullable=True),
    Column("statut", String, nullable=False, server_default="ouvert"),  # ouvert|clos
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
    Column("date_cloture", TIMESTAMP, nullable=True),
)

vote_options = Table(
    "vote_options",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("vote_id", Integer, ForeignKey("votes.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("texte", String, nullable=False),
)

vote_bulletins = Table(
    "vote_bulletins",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("vote_id", Integer, ForeignKey("votes.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("option_id", Integer, ForeignKey("vote_options.id", ondelete="CASCADE"), nullable=False),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
    UniqueConstraint("vote_id", "utilisateur_id", name="unique_vote_bulletin"),
)


# ==================== NOTIFICATIONS ====================

notifications = Table(
    "notifications",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=True, index=True),
    Column("type", String, nullable=False),          # activite|evenement|vote|anniversaire|rotation|gage
    Column("titre", String, nullable=False),
    Column("message", Text, nullable=True),
    Column("lien", String, nullable=True),           # ex: "activite:5", "vote:3", "agenda"
    # Clé naturelle pour éviter les doublons (ex: anniversaire d'un jour donné).
    Column("cle", String, nullable=True, index=True),
    Column("lu", Boolean, nullable=False, server_default="0"),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)


# ==================== ANNEXE V3 — courses, dépenses, menu, chat, boutique, défis ====================

# ─── Liste de courses ───────────────────────────────────────────────────────
courses_items = Table(
    "courses_items",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("nom", String, nullable=False),
    Column("quantite", String, nullable=True),
    Column("categorie", String, nullable=True),
    Column("achete", Boolean, nullable=False, server_default="0"),
    Column("ajoute_par", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("achete_par", Integer, ForeignKey("utilisateurs.id"), nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Dépenses partagées ─────────────────────────────────────────────────────
depenses = Table(
    "depenses",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("montant", Float, nullable=False),
    Column("paye_par", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date", TIMESTAMP, server_default=func.now()),
    Column("categorie", String, nullable=True),
    Column("description", Text, nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

depense_parts = Table(
    "depense_parts",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("depense_id", Integer, ForeignKey("depenses.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
)

# ─── Menu de la semaine ─────────────────────────────────────────────────────
repas = Table(
    "repas",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("date", Date, nullable=False),
    Column("moment", String, nullable=False),  # petit_dej|midi|soir
    Column("titre", String, nullable=False),
    Column("notes", Text, nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Chat de maison ─────────────────────────────────────────────────────────
messages = Table(
    "messages",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("contenu", Text, nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Commentaires d'activité ────────────────────────────────────────────────
activite_commentaires = Table(
    "activite_commentaires",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("activite_id", Integer, ForeignKey("activites.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("contenu", Text, nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Boutique de récompenses ────────────────────────────────────────────────
boutique_recompenses = Table(
    "boutique_recompenses",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("nom", String, nullable=False),
    Column("cout_points", Integer, nullable=False),
    Column("description", Text, nullable=True),
    Column("actif", Boolean, nullable=False, server_default="1"),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

recompense_echanges = Table(
    "recompense_echanges",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("recompense_id", Integer, ForeignKey("boutique_recompenses.id"), nullable=False, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("cout", Integer, nullable=False),
    Column("statut", String, nullable=False, server_default="demande"),  # demande|valide|refuse
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Points, classement & badges ────────────────────────────────────────────
points_log = Table(
    "points_log",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False, index=True),
    Column("delta", Integer, nullable=False),
    Column("motif", String, nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Défis de maison ────────────────────────────────────────────────────────
defis = Table(
    "defis",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("description", Text, nullable=True),
    Column("points", Integer, nullable=False, server_default="0"),
    Column("date_fin", TIMESTAMP, nullable=True),
    Column("statut", String, nullable=False, server_default="ouvert"),  # ouvert|clos
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

defi_participants = Table(
    "defi_participants",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("defi_id", Integer, ForeignKey("defis.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("termine", Boolean, nullable=False, server_default="0"),
    UniqueConstraint("defi_id", "utilisateur_id", name="unique_defi_participant"),
)

# ─── Sous-tâches d'activité ─────────────────────────────────────────────────
activite_sous_taches = Table(
    "activite_sous_taches",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("activite_id", Integer, ForeignKey("activites.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("fait", Boolean, nullable=False, server_default="0"),
)

# ─── RSVP événements ────────────────────────────────────────────────────────
evenement_reponses = Table(
    "evenement_reponses",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("evenement_id", Integer, ForeignKey("evenements.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("reponse", String, nullable=False),  # oui|non|peut_etre
    UniqueConstraint("evenement_id", "utilisateur_id", name="unique_evenement_reponse"),
)


# ==================== ANNEXE V4 — Logement, pièces, tâches, règles ====================

# ─── Pièces de la maison ────────────────────────────────────────────────────
pieces = Table(
    "pieces",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("nom", String, nullable=False),
    # chambre|salon|cuisine|salle_de_bain|bureau|garage|autre
    Column("type", String, nullable=False, server_default="autre"),
    Column("affecte_a", Integer, ForeignKey("utilisateurs.id"), nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Règles de la maison (votées ou adoptées directement) ──────────────────
regles = Table(
    "regles",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("contenu", Text, nullable=False),
    Column("statut", String, nullable=False, server_default="adoptee"),  # proposee|adoptee|rejetee
    Column("vote_id", Integer, ForeignKey("votes.id"), nullable=True),
    Column("ordre", Integer, nullable=False, server_default="0"),
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Tâches domestiques (corvées : fixe/rotation, gage, échéance auto) ──────
taches = Table(
    "taches",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("maison_id", Integer, ForeignKey("maisons.id"), nullable=False, index=True),
    Column("titre", String, nullable=False),
    Column("description", Text, nullable=True),
    Column("piece_id", Integer, ForeignKey("pieces.id"), nullable=True),
    # ponctuel|quotidien|hebdo|mensuel
    Column("frequence", String, nullable=False, server_default="ponctuel"),
    # fixe|rotation
    Column("assignation", String, nullable=False, server_default="fixe"),
    Column("assigne_id", Integer, ForeignKey("utilisateurs.id"), nullable=True),
    Column("rotation_ordre", Text, nullable=True),  # JSON [user_id, ...]
    Column("rotation_index", Integer, nullable=False, server_default="0"),
    Column("rotation_conditions", Text, nullable=True),
    Column("gage_actif", Boolean, nullable=False, server_default="0"),
    Column("penalite", Text, nullable=True),
    Column("recompense", Text, nullable=True),
    Column("points_penalite", Integer, nullable=False, server_default="0"),
    Column("points_recompense", Integer, nullable=False, server_default="0"),
    Column("echeance_date", Date, nullable=True),
    Column("echeance_heure", String, nullable=True),  # "HH:MM"
    Column("statut", String, nullable=False, server_default="a_faire"),  # a_faire|fait
    Column("prochaine_echeance", TIMESTAMP, nullable=True),
    Column("createur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)

# ─── Historique des validations de tâches (par période) ─────────────────────
tache_validations = Table(
    "tache_validations",
    metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("tache_id", Integer, ForeignKey("taches.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("utilisateur_id", Integer, ForeignKey("utilisateurs.id"), nullable=False),
    Column("periode_cle", String, nullable=True),
    Column("date_creation", TIMESTAMP, server_default=func.now()),
)
