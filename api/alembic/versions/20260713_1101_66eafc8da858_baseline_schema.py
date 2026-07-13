"""baseline schema

Révision initiale (baseline) : crée l'intégralité du schéma directement à partir
de la metadata SQLAlchemy de l'app (`app.database.database.metadata`).

Ce choix garantit que la baseline correspond EXACTEMENT à `tables.py` (types
Numeric, contraintes d'unicité, index compris), sans dépendre du rendu de
l'autogenerate. Les migrations SUIVANTES seront, elles, générées normalement via
`alembic revision --autogenerate` (diff entre la base et la metadata).

Revision ID: 66eafc8da858
Revises:
Create Date: 2026-07-13 11:01:57.101318
"""
from typing import Sequence, Union

from alembic import op

from app.database.database import metadata

# revision identifiers, used by Alembic.
revision: str = "66eafc8da858"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crée toutes les tables/index/contraintes tels que définis dans tables.py.
    metadata.create_all(op.get_bind())


def downgrade() -> None:
    metadata.drop_all(op.get_bind())
