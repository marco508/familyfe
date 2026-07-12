# app/main.py
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from app.config import settings
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
        ("rotation_active", "INTEGER NOT NULL DEFAULT 0"),
        ("rotation_ordre", "TEXT"),
        ("rotation_index", "INTEGER NOT NULL DEFAULT 0"),
        ("rotation_delai_jours", "INTEGER NOT NULL DEFAULT 0"),
        ("rotation_echeance", "TIMESTAMP"),
        ("recurrence", "VARCHAR NOT NULL DEFAULT 'aucune'"),
        ("preuve_url", "VARCHAR"),
        # ANNEXE V4
        ("visibilite", "VARCHAR NOT NULL DEFAULT 'maison'"),
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
    ],
}


def _ensure_columns() -> None:
    """Ajoute les colonnes manquantes (migration légère, idempotente)."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in _COLUMN_MIGRATIONS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    logger.info("Colonne ajoutée: %s.%s", table, name)


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

    yield

    # --- Arrêt ---
    await database.disconnect()
    logger.info("Application arrêtée")


app = FastAPI(
    title="FamyLife API",
    version="1.0.0",
    description="API pour organiser le quotidien d'une maison (membres, activités, agenda, votes)",
    lifespan=lifespan,
    root_path=settings.ROOT_PATH,
)

# CORS — dev : tout autorisé pour permettre à Expo Go de se connecter depuis
# n'importe quelle IP LAN (pas de domaine fixe côté mobile).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
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
