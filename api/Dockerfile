# syntax=docker/dockerfile:1

# Image légère avec une version de Python supportée par pydantic-core / PyO3.
# (Python 3.14 casse le build de pydantic-core : on fige 3.12 ici.)
FROM python:3.12-slim

# - PYTHONUNBUFFERED : logs uvicorn en temps réel (pas de buffering)
# - PYTHONDONTWRITEBYTECODE : pas de .pyc dans le conteneur
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 1) Dépendances d'abord pour profiter du cache de couche Docker.
#    On installe requirements-postgres.txt (qui inclut requirements.txt + les
#    drivers PostgreSQL asyncpg/psycopg2, nécessaires en prod).
COPY requirements.txt requirements-postgres.txt ./
RUN pip install --no-cache-dir -r requirements-postgres.txt

# 2) Code applicatif
COPY . .

# 3) Répertoire d'uploads (avatars, preuves) — monté comme volume dans compose.
#    Créé ici pour que le volume nommé hérite du bon propriétaire.
RUN mkdir -p /app/uploads/avatars /app/uploads/preuves

# 4) Utilisateur non-root
RUN useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8005

# Healthcheck applicatif (endpoint /health défini dans app/main.py)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:8005/health').status==200 else sys.exit(1)"

# Pas de --reload en conteneur (c'est pour le dev local via run.sh).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
