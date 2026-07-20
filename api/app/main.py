# app/main.py
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from sqlalchemy import inspect, text

from app.config import settings
from app.utils.ratelimit import limiter
from app.database.database import database, engine, metadata
from app.routers import (
    activites,
    auth,
    boutique,
    chat,
    courses,
    defis,
    depenses,
    evenements,
    maisons,
    notifications,
    pieces,
    regles,
    repas,
    stats,
    taches,
    users,
    votes,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Répertoire des fichiers uploadés (avatars, preuves) — servi en statique sous /uploads.
UPLOAD_DIR = "uploads"


# Colonnes ajoutées après la première version : on les crée à la volée sur les
# bases SQLite existantes (create_all ne modifie pas les tables déjà présentes).
_COLUMN_MIGRATIONS = {
    "utilisateurs": [
        ("date_naissance", "DATE"),
        ("push_token", "VARCHAR"),
        # ANNEXE V5 — invalidation des JWT
        ("token_version", "INTEGER NOT NULL DEFAULT 0"),
        # ─── ANNEXE V8 — Préférences de notification ────────────────────────
        # Contrairement à `maisons.modules` (dont le DEFAULT vaut « tout » pour
        # préserver l'existant), ici on stocke les catégories DÉSACTIVÉES : le
        # DEFAULT '' veut déjà dire « tout activé ». Aucun compte déjà en base ne
        # perd de notification, et les nouveaux comptes ont le même réglage.
        ("notif_desactivees", "TEXT NOT NULL DEFAULT ''"),
    ],
    "membres_maison": [
        ("points", "INTEGER NOT NULL DEFAULT 0"),
        ("est_enfant", "INTEGER NOT NULL DEFAULT 0"),
        # ANNEXE V4
        ("lien_famille", "VARCHAR"),
        ("role_expire_le", "TIMESTAMP"),
        ("visite_expire_le", "TIMESTAMP"),
        ("regles_vues_le", "TIMESTAMP"),
    ],
    "activites": [
        ("gage_actif", "INTEGER NOT NULL DEFAULT 0"),
        ("penalite", "TEXT"),
        ("recompense", "TEXT"),
        ("points_penalite", "INTEGER NOT NULL DEFAULT 0"),
        ("points_recompense", "INTEGER NOT NULL DEFAULT 0"),
        ("gage_resultat", "VARCHAR NOT NULL DEFAULT 'en_attente'"),
        ("heure_echeance", "VARCHAR"),
        ("rappel", "INTEGER NOT NULL DEFAULT 1"),
        # Les colonnes rotation_* ont été retirées : la rotation n'a de sens que
        # pour les corvées (table `taches`), pas pour un moment à vivre ensemble.
        # On ne les ajoute plus aux bases neuves, et on ne joue volontairement
        # AUCUN `DROP COLUMN` sur les bases existantes (mal supporté par SQLite,
        # sans bénéfice) : elles y restent inertes. Voir database/tables.py.
        ("recurrence", "VARCHAR NOT NULL DEFAULT 'aucune'"),
        ("preuve_url", "VARCHAR"),
        # ANNEXE V4
        ("visibilite", "VARCHAR NOT NULL DEFAULT 'maison'"),
        # ANNEXE V5 — seuil par jour de semaine + effets de gage paramétrables
        ("echeance_jour_semaine", "INTEGER"),
        ("gage_effets_echec", "TEXT"),
        ("gage_effets_reussite", "TEXT"),
    ],
    "taches": [
        # ANNEXE V5 — gage « corvée » cumulatif + seuil par jour de semaine
        ("gage_semaines", "INTEGER NOT NULL DEFAULT 2"),
        ("gage_semaines_restantes", "INTEGER NOT NULL DEFAULT 0"),
        ("echeance_jour_semaine", "INTEGER"),
        # ANNEXE V5 — effets de gage paramétrables (JSON)
        ("gage_effets_echec", "TEXT"),
        ("gage_effets_reussite", "TEXT"),
    ],
    "evenements": [
        ("recurrence", "VARCHAR NOT NULL DEFAULT 'aucune'"),
    ],
    # ─── ANNEXE V4 ──────────────────────────────────────────────────────────
    "maisons": [
        ("type_logement", "VARCHAR NOT NULL DEFAULT 'maison'"),
        ("adresse", "VARCHAR"),
        ("complement", "VARCHAR"),
        ("code_postal", "VARCHAR"),
        ("ville", "VARCHAR"),
        ("pays", "VARCHAR"),
        ("etage", "VARCHAR"),
        ("numero_appartement", "VARCHAR"),
        ("digicode", "VARCHAR"),
        ("interphone", "VARCHAR"),
        ("acces", "TEXT"),
        ("surface", "FLOAT"),
        # ─── ANNEXE V7 — Découverte progressive ─────────────────────────────
        # Le DEFAULT vaut tous les modules : appliqué aux foyers DÉJÀ en base,
        # il garantit qu'aucun d'eux ne perd de fonctionnalité à la migration.
        # Les nouveaux foyers reçoivent le set minimal via create_maison.
        ("modules", "TEXT NOT NULL DEFAULT 'courses,depenses,decisions,jeu,portefeuille,chat'"),
    ],
}


def _ensure_columns() -> None:
    """Ajoute les colonnes manquantes (migration légère, idempotente).

    Tolère les races entre plusieurs workers qui démarrent en parallèle : si un
    autre worker a déjà ajouté la colonne entre le check et l'ALTER, l'erreur
    « duplicate column » est absorbée. Reste un filet de dev — pour de vraies
    évolutions de schéma, utiliser Alembic (voir README).
    """
    insp = inspect(engine)
    for table, cols in _COLUMN_MIGRATIONS.items():
        if not insp.has_table(table):
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols:
            if name in existing:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                logger.info("Colonne ajoutée: %s.%s", table, name)
            except Exception as exc:  # noqa: BLE001 — race entre workers tolérée
                logger.info("ALTER ignoré (%s.%s déjà présent ?): %s", table, name, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Démarrage ---
    if settings.AUTO_CREATE_TABLES:
        # Dev uniquement : crée les tables SQLite si elles n'existent pas encore.
        metadata.create_all(engine)
        _ensure_columns()
        logger.info("Tables vérifiées / créées (AUTO_CREATE_TABLES)")

    # Répertoires d'upload (avatars, preuves) — ANNEXE V3.
    os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "preuves"), exist_ok=True)

    await database.connect()
    logger.info("Application démarrée en mode %s", settings.ENVIRONMENT)
    logger.info("Base de données connectée (%s)", settings.DATABASE_URL)

    # Effets de bord (gages de tâches, anniversaires) : désormais planifiés en
    # arrière-plan plutôt que déclenchés à la lecture. On les applique une fois
    # au démarrage puis on lance le scheduler pour les rejeux périodiques.
    from app.services.scheduler import (
        appliquer_effets_toutes_maisons,
        generer_anniversaires_toutes_maisons,
        start_scheduler,
        stop_scheduler,
    )
    try:
        await appliquer_effets_toutes_maisons()
        await generer_anniversaires_toutes_maisons()
    except Exception as exc:  # noqa: BLE001 — ne bloque jamais le démarrage
        logger.warning("Effets initiaux au démarrage échoués (ignoré): %s", exc)
    start_scheduler()

    yield

    # --- Arrêt ---
    stop_scheduler()
    await database.disconnect()
    logger.info("Application arrêtée")


app = FastAPI(
    title="FamyLife API",
    version="1.0.0",
    description="API pour organiser le quotidien d'une maison (membres, activités, agenda, votes)",
    lifespan=lifespan,
    root_path=settings.ROOT_PATH,
)

# Rate limiting global (slowapi) : le limiteur est disponible via app.state,
# et les dépassements renvoient un 429 propre.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS.
# En dev : tout autorisé pour qu'Expo Go se connecte depuis n'importe quelle IP
# LAN (pas de domaine fixe côté mobile). En production : on restreint aux
# origines déclarées dans CORS_ORIGINS (jamais wildcard + credentials ensemble).
if settings.is_development:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_origin_regex=settings.CORS_ORIGIN_REGEX,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

# Fichiers uploadés (avatars, preuves d'activité) — ANNEXE V3.
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Inclusion des routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(maisons.router)
app.include_router(activites.router)
app.include_router(evenements.router)
app.include_router(votes.router)
app.include_router(notifications.router)
# ANNEXE V3
app.include_router(courses.router)
app.include_router(depenses.router)
app.include_router(repas.router)
app.include_router(chat.router)
app.include_router(boutique.router)
app.include_router(defis.router)
# ANNEXE V4
app.include_router(pieces.router)
app.include_router(taches.router)
app.include_router(regles.router)
# ANNEXE V6 — Équité, séries, bilan
app.include_router(stats.router)


@app.get("/")
async def root():
    return {
        "message": "Bienvenue sur l'API FamyLife",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
