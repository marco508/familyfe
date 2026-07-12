# app/models/schemas.py
"""Modèles Pydantic pour les payloads des routes (source de vérité des contrats JSON)."""
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ==================== Auth ====================

class Token(BaseModel):
    access_token: str
    token_type: str


class SignupInput(BaseModel):
    nom: str
    email: str
    password: str
    telephone: Optional[str] = None
    date_naissance: Optional[date] = None


class UpdateMeInput(BaseModel):
    nom: str
    email: str
    telephone: Optional[str] = None
    image: Optional[str] = None
    date_naissance: Optional[date] = None


# ==================== Users ====================

class TelephonesInput(BaseModel):
    telephones: List[str] = Field(default_factory=list)


# ==================== Maisons ====================

class MaisonCreateInput(BaseModel):
    nom: str
    emoji: Optional[str] = "🏠"
    couleur: Optional[str] = "#FF4E9B"


class MaisonUpdateInput(BaseModel):
    nom: Optional[str] = None
    emoji: Optional[str] = None
    couleur: Optional[str] = None
    # ANNEXE V4 — Adresse & logement
    type_logement: Optional[str] = None  # maison|appartement
    adresse: Optional[str] = None
    complement: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    pays: Optional[str] = None
    etage: Optional[str] = None
    numero_appartement: Optional[str] = None
    digicode: Optional[str] = None
    interphone: Optional[str] = None
    acces: Optional[str] = None
    surface: Optional[float] = None


class MaisonJoinInput(BaseModel):
    code_invitation: str


class MembreAddInput(BaseModel):
    utilisateur_id: int


class RoleUpdateInput(BaseModel):
    # 'co_chef' | 'chef_temporaire' | 'membre' | 'visiteur' (le passage à 'chef'
    # se fait exclusivement via /transferer-chef) — ANNEXE V4 : role désormais optionnel
    # (on peut ne mettre à jour que lien_famille/est_enfant).
    role: Optional[str] = None
    lien_famille: Optional[str] = None  # pere|mere|enfant|frere|soeur|conjoint|autre
    est_enfant: Optional[bool] = None
    expire_le: Optional[datetime] = None  # chef_temporaire (role_expire_le) / visiteur (visite_expire_le)


class TransfererChefInput(BaseModel):
    utilisateur_id: int


# ─── ANNEXE V4 — Chef temporaire & visiteurs ─────────────────────────────

class ChefTemporaireInput(BaseModel):
    utilisateur_id: int
    expire_le: Optional[datetime] = None


class VisiteurInput(BaseModel):
    utilisateur_id: int
    expire_le: Optional[datetime] = None


# ─── ANNEXE V4 — Pièces ──────────────────────────────────────────────────

class PieceCreateInput(BaseModel):
    nom: str
    type: Optional[str] = "autre"  # chambre|salon|cuisine|salle_de_bain|bureau|garage|autre
    affecte_a: Optional[int] = None


class PieceUpdateInput(BaseModel):
    nom: Optional[str] = None
    type: Optional[str] = None
    affecte_a: Optional[int] = None


class PieceAffecterInput(BaseModel):
    utilisateur_id: Optional[int] = None


# ─── ANNEXE V4 — Règles ──────────────────────────────────────────────────

class RegleCreateInput(BaseModel):
    titre: str
    contenu: str
    soumettre_au_vote: Optional[bool] = False


class RegleUpdateInput(BaseModel):
    titre: Optional[str] = None
    contenu: Optional[str] = None
    ordre: Optional[int] = None


# ─── ANNEXE V4 — Tâches domestiques ──────────────────────────────────────

class TacheCreateInput(BaseModel):
    titre: str
    description: Optional[str] = None
    piece_id: Optional[int] = None
    frequence: Optional[str] = "ponctuel"  # ponctuel|quotidien|hebdo|mensuel
    assignation: Optional[str] = "fixe"    # fixe|rotation
    assigne_id: Optional[int] = None
    rotation_ordre: Optional[List[int]] = None
    rotation_conditions: Optional[str] = None
    gage_actif: Optional[bool] = False
    penalite: Optional[str] = None
    recompense: Optional[str] = None
    points_penalite: Optional[int] = 0
    points_recompense: Optional[int] = 0
    echeance_date: Optional[date] = None
    echeance_heure: Optional[str] = None


class TacheUpdateInput(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    piece_id: Optional[int] = None
    frequence: Optional[str] = None
    assignation: Optional[str] = None
    assigne_id: Optional[int] = None
    rotation_ordre: Optional[List[int]] = None
    rotation_conditions: Optional[str] = None
    gage_actif: Optional[bool] = None
    penalite: Optional[str] = None
    recompense: Optional[str] = None
    points_penalite: Optional[int] = None
    points_recompense: Optional[int] = None
    echeance_date: Optional[date] = None
    echeance_heure: Optional[str] = None
    statut: Optional[str] = None


# ==================== Activités ====================

class ActiviteCreateInput(BaseModel):
    titre: str
    description: Optional[str] = None
    statut: Optional[str] = "a_faire"
    date_echeance: Optional[date] = None
    heure_echeance: Optional[str] = None       # "HH:MM"
    rappel: Optional[bool] = True              # notifier les membres/assignés
    assignes: Optional[List[int]] = None
    # Système de gage (optionnel)
    gage_actif: Optional[bool] = False
    penalite: Optional[str] = None
    recompense: Optional[str] = None
    points_penalite: Optional[int] = 0
    points_recompense: Optional[int] = 0
    # Rotation / relais de tours (optionnel, paramétrable)
    rotation_active: Optional[bool] = False
    rotation_ordre: Optional[List[int]] = None    # ordre des membres qui prennent le tour
    rotation_delai_jours: Optional[int] = 0       # délai avant passage au suivant
    # Récurrence : 'aucune' | 'quotidien' | 'hebdo' | 'mensuel'
    recurrence: Optional[str] = "aucune"
    # ANNEXE V4 — activité sociale : visibilité restreinte à des participants
    visibilite: Optional[str] = "maison"   # maison|participants
    participants: Optional[List[int]] = None


class ActiviteUpdateInput(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    statut: Optional[str] = None
    date_echeance: Optional[date] = None
    heure_echeance: Optional[str] = None
    rappel: Optional[bool] = None
    assignes: Optional[List[int]] = None
    # Système de gage (optionnel)
    gage_actif: Optional[bool] = None
    penalite: Optional[str] = None
    recompense: Optional[str] = None
    points_penalite: Optional[int] = None
    points_recompense: Optional[int] = None
    # Rotation / relais de tours
    rotation_active: Optional[bool] = None
    rotation_ordre: Optional[List[int]] = None
    rotation_delai_jours: Optional[int] = None
    recurrence: Optional[str] = None
    # ANNEXE V4
    visibilite: Optional[str] = None
    participants: Optional[List[int]] = None


class ActiviteStatutInput(BaseModel):
    statut: str


class GageResoudreInput(BaseModel):
    # 'reussi' -> récompense (+points_recompense) ; 'echoue' -> gage/pénalité (-points_penalite)
    resultat: str


class SousTacheCreateInput(BaseModel):
    titre: str


class SousTacheUpdateInput(BaseModel):
    fait: Optional[bool] = None
    titre: Optional[str] = None


class CommentaireCreateInput(BaseModel):
    contenu: str


# ==================== Événements ====================

class EvenementCreateInput(BaseModel):
    titre: str
    description: Optional[str] = None
    date_debut: datetime
    date_fin: Optional[datetime] = None
    toute_la_journee: Optional[bool] = False
    lieu: Optional[str] = None
    couleur: Optional[str] = "#7B5CFF"
    # Récurrence : 'aucune' | 'hebdo' | 'mensuel' (indicatif)
    recurrence: Optional[str] = "aucune"


class EvenementUpdateInput(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    date_debut: Optional[datetime] = None
    date_fin: Optional[datetime] = None
    toute_la_journee: Optional[bool] = None
    lieu: Optional[str] = None
    couleur: Optional[str] = None
    recurrence: Optional[str] = None


class ReponseEvenementInput(BaseModel):
    reponse: str  # 'oui' | 'non' | 'peut_etre'


# ==================== Votes ====================

class VoteCreateInput(BaseModel):
    question: str
    description: Optional[str] = None
    options: List[str]


class VoteVoterInput(BaseModel):
    option_id: int


# ==================== ANNEXE V3 ====================

# ─── Courses ─────────────────────────────────────────────────────────────

class CourseItemCreateInput(BaseModel):
    nom: str
    quantite: Optional[str] = None
    categorie: Optional[str] = None


class CourseItemUpdateInput(BaseModel):
    achete: Optional[bool] = None
    nom: Optional[str] = None
    quantite: Optional[str] = None
    categorie: Optional[str] = None


# ─── Dépenses ────────────────────────────────────────────────────────────

class DepenseCreateInput(BaseModel):
    titre: str
    montant: float
    paye_par: Optional[int] = None
    date: Optional[datetime] = None
    categorie: Optional[str] = None
    description: Optional[str] = None
    participants: Optional[List[int]] = None


class DepenseUpdateInput(BaseModel):
    titre: Optional[str] = None
    montant: Optional[float] = None
    paye_par: Optional[int] = None
    date: Optional[datetime] = None
    categorie: Optional[str] = None
    description: Optional[str] = None
    participants: Optional[List[int]] = None


# ─── Menu de la semaine ──────────────────────────────────────────────────

class RepasCreateInput(BaseModel):
    date: date
    moment: str  # petit_dej|midi|soir
    titre: str
    notes: Optional[str] = None


class RepasUpdateInput(BaseModel):
    date: Optional[date] = None
    moment: Optional[str] = None
    titre: Optional[str] = None
    notes: Optional[str] = None


class RepasVersCoursesInput(BaseModel):
    items: List[str]


# ─── Chat ────────────────────────────────────────────────────────────────

class MessageCreateInput(BaseModel):
    contenu: str


# ─── Boutique de récompenses ─────────────────────────────────────────────

class BoutiqueCreateInput(BaseModel):
    nom: str
    cout_points: int
    description: Optional[str] = None
    actif: Optional[bool] = True


class BoutiqueUpdateInput(BaseModel):
    nom: Optional[str] = None
    cout_points: Optional[int] = None
    description: Optional[str] = None
    actif: Optional[bool] = None


# ─── Défis ───────────────────────────────────────────────────────────────

class DefiCreateInput(BaseModel):
    titre: str
    description: Optional[str] = None
    points: int
    date_fin: Optional[datetime] = None


# ─── Push token ──────────────────────────────────────────────────────────

class PushTokenInput(BaseModel):
    token: str
