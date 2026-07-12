"""
Connexion à la base de données — SOURCE UNIQUE des objets `database` et `engine`.

`database.py` réexporte ces objets (ne les recrée pas) afin d'éviter
deux pools de connexions distincts.
"""
from databases import Database
from sqlalchemy import create_engine, MetaData
from sqlalchemy.pool import NullPool

from app.config import settings

# Metadata pour SQLAlchemy Core (partagé par toutes les tables)
metadata = MetaData()

# Connexion async (utilisée dans les routes FastAPI) — instance unique.
database = Database(settings.DATABASE_URL)

# Engine sync : utilisé UNIQUEMENT pour create_all au démarrage (dev).
# SQLite ne supporte pas le driver async "+aiosqlite" côté engine sync : on le retire.
_sync_url = settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
_is_sqlite = _sync_url.startswith("sqlite")

engine = create_engine(
    _sync_url,
    echo=settings.is_development,
    poolclass=NullPool,
    # check_same_thread=False : nécessaire pour SQLite car create_all()
    # peut s'exécuter depuis un thread différent de celui qui a ouvert le fichier.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)
