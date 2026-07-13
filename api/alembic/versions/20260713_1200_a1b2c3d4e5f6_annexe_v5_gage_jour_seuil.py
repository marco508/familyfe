"""ANNEXE V5 : gage cumulatif + jour-seuil (consolidé dans la baseline) — no-op

Les colonnes de l'ANNEXE V5 (taches.gage_semaines, gage_semaines_restantes,
echeance_jour_semaine ; activites.echeance_jour_semaine) font partie de la
baseline, qui construit le schéma courant complet via `metadata.create_all`.

Cette révision est conservée pour la continuité de l'historique mais n'applique
aucun changement. (Consolidation pré-release : rien n'est encore déployé.)

Revision ID: a1b2c3d4e5f6
Revises: 66eafc8da858
Create Date: 2026-07-13 12:00:00.000000
"""
from typing import Sequence, Union

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "66eafc8da858"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
