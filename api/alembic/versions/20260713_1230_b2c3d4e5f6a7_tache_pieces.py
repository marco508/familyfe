"""ANNEXE V5 : table tache_pieces (consolidée dans la baseline) — no-op

La table `tache_pieces` (association tâche ↔ pièces) fait partie de la baseline,
qui construit le schéma courant complet via `metadata.create_all`.

Cette révision est conservée pour la continuité de l'historique mais n'applique
aucun changement. (Consolidation pré-release : rien n'est encore déployé.)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-13 12:30:00.000000
"""
from typing import Sequence, Union

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
