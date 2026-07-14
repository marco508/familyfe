# FamyLife API

Backend FastAPI de l'application FamyLife (organisation d'une maison :
membres, activités, agenda, votes).

Mêmes technos que `Mo/yomu` : FastAPI + `databases` (async) + SQLAlchemy Core
+ JWT (`python-jose`) + `bcrypt`. Base **SQLite** par défaut (aucun serveur
externe requis, ni Postgres ni Redis) pour un démarrage local immédiat.

## Démarrage rapide

```bash
cd api
python -m venv .venv
source .venv/bin/activate   # ou .venv\Scripts\activate sous Windows
pip install -r requirements.txt

# optionnel : copiez .env.example en .env pour personnaliser la config
cp .env.example .env

./run.sh
# ou directement :
uvicorn app.main:app --host 0.0.0.0 --port 8005 --reload
```

L'API est servie sur `http://localhost:8005`. Documentation interactive sur
`http://localhost:8005/docs`.

Au premier démarrage, les tables sont créées automatiquement dans
`famylife.db` (SQLite) grâce à `AUTO_CREATE_TABLES=True`.

> Astuce : installez une version de Python **≤ 3.13**. Python 3.14 casse le
> build de `pydantic-core` (PyO3 ne le supporte pas encore). En cas de doute,
> utilisez plutôt Docker (ci-dessous), qui fige Python 3.12.

## Démarrage avec Docker (API + PostgreSQL)

Le `docker-compose.yml` à la racine du dépôt lance l'API **et** une base
PostgreSQL persistante, sans rien installer localement (ni Python, ni Postgres).

```bash
# depuis la racine du dépôt (familyfe/), pas depuis api/
docker compose up --build
```

- API : `http://localhost:8005` (doc : `/docs`)
- PostgreSQL : exposé sur `localhost:5432` (user/mdp/base : `famylife`)

Les données de la base sont conservées dans le volume `pgdata`, et les fichiers
uploadés (avatars, preuves) dans le volume `uploads` — ils survivent aux
redémarrages. Pour repartir de zéro : `docker compose down -v`.

Pour personnaliser les identifiants et la clé secrète, copiez `.env.example`
(racine) en `.env`. En production, définissez impérativement un vrai
`SECRET_KEY` (`openssl rand -hex 32`).

En Docker, la base est PostgreSQL (`postgresql+asyncpg://…`) ; le code bascule
automatiquement dessus via la variable `DATABASE_URL` — le mode SQLite local
reste inchangé pour un `uvicorn` lancé à la main.

## Migrations (Alembic)

Le schéma est versionné avec Alembic (`alembic/`). En Docker, les migrations
sont appliquées automatiquement au démarrage (`alembic upgrade head`, voir
`docker-compose.yml`), et `AUTO_CREATE_TABLES` est mis à `False`.

En local :

```bash
# appliquer les migrations
alembic upgrade head

# après avoir modifié app/database/tables.py : générer une migration
alembic revision --autogenerate -m "description du changement"
```

La migration initiale (baseline) crée tout le schéma à partir de la metadata de
l'app ; les suivantes sont des diffs. `AUTO_CREATE_TABLES=True` (défaut dev)
reste pratique pour un démarrage local sans Alembic, mais en production on
s'appuie sur les migrations.

## Tâches planifiées (scheduler)

Certains effets de bord ne sont plus déclenchés à la lecture mais exécutés en
arrière-plan par APScheduler (`app/services/scheduler.py`), démarré avec l'app :

- rotations d'activités et gages de tâches en retard : toutes les 5 minutes ;
- notifications d'anniversaire : toutes les heures (idempotent).

Ces jobs sont sûrs à rejouer (claims atomiques + clés d'idempotence).

## Montants (Numeric)

Les montants de dépenses sont stockés en `NUMERIC(10,2)` (exact, sans erreur
d'arrondi). L'API continue de les échanger en nombres JSON : la conversion
Decimal↔float est faite à la frontière (voir `app/routers/depenses.py`).

## Tests

Suite pytest dans `tests/` (base SQLite temporaire, montée via le lifespan de
l'app). Elle couvre l'auth et la révocation de token, la validation des montants
et coûts, les dépenses/bilan, les tâches multi-pièces + gage + jour-seuil, et le
rate-limiting.

```bash
pip install -r requirements-dev.txt
pytest
```

## Sessions & révocation de token

Les JWT embarquent une version de session (`tv`) comparée à
`utilisateurs.token_version`. `POST /me/deconnexion-globale` incrémente cette
version et invalide donc **tous** les tokens existants de l'utilisateur (vol de
token, déconnexion de tous les appareils) sans attendre leur expiration.

## Endpoints

Voir `../SPEC.md` (section 3) pour le contrat complet des endpoints REST
(santé/auth, recherche d'utilisateurs, maisons, activités, agenda, votes).

## Structure

```
app/
  config.py              # Settings (pydantic-settings), valeurs par défaut de dev
  database/
    connection.py        # source unique de `metadata` / `database` / `engine`
    tables.py             # schéma SQLAlchemy Core (source de vérité)
    database.py           # réexporte connection.py + tables.py
  utils/
    security.py            # hash/verify password, JWT
    codes.py                # génération code_invitation unique
  models/
    schemas.py             # modèles Pydantic (payloads des routes)
  dependencies.py         # get_current_user + helpers d'autorisation maison
  routers/
    auth.py, users.py, maisons.py, activites.py, evenements.py, votes.py
  main.py                 # FastAPI app, CORS, lifespan (connect DB / create_all)
```
