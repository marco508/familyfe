"""Environnement Alembic — branché sur la metadata et l'URL de l'app.

- `target_metadata` = la metadata SQLAlchemy Core de l'app (source de vérité du
  schéma), ce qui permet l'autogenerate.
- L'URL est dérivée de `settings.DATABASE_URL` en retirant le driver async
  (`+aiosqlite` / `+asyncpg`) : Alembic travaille avec un moteur synchrone.
- `render_as_batch=True` : nécessaire pour que les futures migrations de type
  ALTER fonctionnent aussi sur SQLite.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import settings
from app.database.database import metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = metadata


def _sync_url() -> str:
    """URL synchrone dérivée de DATABASE_URL (retire le driver async)."""
    return settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_sync_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
