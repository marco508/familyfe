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
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

L'API est servie sur `http://localhost:8000`. Documentation interactive sur
`http://localhost:8000/docs`.

Au premier démarrage, les tables sont créées automatiquement dans
`famylife.db` (SQLite) grâce à `AUTO_CREATE_TABLES=True`.

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
