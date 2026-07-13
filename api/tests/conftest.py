"""Fixtures de test partagées.

L'environnement (base SQLite temporaire, mode dev) est configuré AVANT l'import
de l'app, car `app.config`/`app.database.connection` lisent ces variables au
chargement du module.
"""
import os
import tempfile

# --- Configuration de l'environnement de test (avant tout import de l'app) ---
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "development"
os.environ["SECRET_KEY"] = "test-secret-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.utils.ratelimit import limiter  # noqa: E402

# Le rate-limiting est désactivé par défaut dans les tests pour éviter la
# pollution d'état entre tests (le limiteur en mémoire est partagé). Les tests
# qui veulent le vérifier le réactivent explicitement.
limiter.enabled = False


@pytest.fixture()
def client():
    """Client de test synchrone. Le context manager déclenche le lifespan
    (création des tables + connexion à la base + scheduler)."""
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


@pytest.fixture()
def unique_email():
    """Génère un email unique par test (base partagée entre les tests)."""
    _counter["n"] += 1
    return f"user{_counter['n']}@test.local"


@pytest.fixture()
def authed(client, unique_email):
    """Client authentifié avec une maison créée. Renvoie un dict pratique :
    { client, headers, maison_id, user }."""
    client.post("/signup", json={"nom": "Chef", "email": unique_email, "password": "motdepasse8"})
    token = client.post(
        "/token", data={"username": unique_email, "password": "motdepasse8"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers).json()
    maison = client.post("/maisons", json={"nom": "Maison test"}, headers=headers).json()
    return {
        "client": client,
        "headers": headers,
        "maison_id": maison["id"],
        "user": me,
    }
