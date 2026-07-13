"""Moteur de gages / pénalités paramétrables (ANNEXE V5).

Un gage est une **liste d'effets typés** appliqués AUTOMATIQUEMENT au
déclenchement (échec/oubli) ou à la réussite d'une tâche ou d'une activité.
Chaque type d'effet a un handler ; ajouter un nouveau type de gage = ajouter un
handler ici, sans toucher au reste du système.

Types supportés :
- `points` : ajuste le score des destinataires (`valeur`, négative = pénalité).
- `tache`  : crée une tâche ponctuelle assignée à chaque destinataire — le
             « fais X » universel (suivi, rappelé, validé par le système de
             tâches). `titre` + `jours` (échéance).
- `amende` : crée une dépense — le destinataire DOIT `montant` € à la cagnotte
             tenue par le chef de la maison (le fautif paie la cagnotte).
- `note`   : simple message notifié (folklore, sans application matérielle).

Les effets ciblent une LISTE de personnes (une tâche a un titulaire → `[uid]` ;
une activité peut avoir plusieurs assignés).

Non-cassant : si aucune liste d'effets n'est définie, les gages historiques
(points_penalite, gage_semaines) continuent de fonctionner tels quels.
"""
import json
import logging
from datetime import date, datetime, time as dtime, timedelta
from decimal import Decimal
from typing import List, Optional

from app.database.database import database, depense_parts, depenses, taches
from app.services.notifications import notifier
from app.services.points import ajuster_points

logger = logging.getLogger(__name__)

VALID_EFFET_TYPES = {"points", "tache", "amende", "note"}


def parse_effets(value) -> list:
    """Tolère une liste déjà décodée, une chaîne JSON, ou None."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


def dumps_effets(effets) -> Optional[str]:
    """Sérialise une liste d'effets en JSON (ou None si vide)."""
    if not effets:
        return None
    return json.dumps(effets)


async def _creer_tache_gage(cible: int, titre: str, jours: int, maison_id: int, source_titre: str, createur_id: int) -> None:
    echeance = (date.today() + timedelta(days=jours)) if jours > 0 else None
    prochaine = datetime.combine(echeance, dtime(0, 0)) if echeance else None
    await database.execute(
        taches.insert().values(
            maison_id=maison_id,
            titre=f"Gage : {titre}",
            description=f"Gage suite à « {source_titre} »",
            frequence="ponctuel",
            assignation="fixe",
            assigne_id=cible,
            gage_actif=False,
            statut="a_faire",
            echeance_date=echeance,
            prochaine_echeance=prochaine,
            createur_id=createur_id,
        )
    )


async def _creer_amende(cible: int, montant: float, maison_id: int, source_titre: str) -> None:
    """Le fautif doit `montant` € à la cagnotte, tenue par le chef de la maison.
    Modélisé comme une dépense : payée par le chef (cagnotte), à la charge du
    seul fautif → dans le bilan, le fautif doit ce montant."""
    chef = await database.fetch_one("SELECT chef_id FROM maisons WHERE id = :mid", values={"mid": maison_id})
    if not chef:
        return
    chef_id = chef["chef_id"]
    depense_id = await database.execute(
        depenses.insert().values(
            maison_id=maison_id,
            titre=f"Amende : {source_titre}",
            montant=Decimal(str(montant)).quantize(Decimal("0.01")),
            paye_par=chef_id,
            categorie="amende",
        )
    )
    await database.execute(
        depense_parts.insert().values(depense_id=depense_id, utilisateur_id=cible)
    )


async def appliquer_effets(
    effets,
    *,
    maison_id: int,
    cibles: List[int],
    source_titre: str,
    createur_id: int,
    notifier_cibles: bool = True,
) -> List[str]:
    """Applique chaque effet à tous les destinataires. Renvoie des descriptions
    lisibles. Un effet qui échoue est loggé et n'empêche pas les autres."""
    cibles = [c for c in (cibles or []) if c]
    descriptions: List[str] = []
    for effet in parse_effets(effets):
        if not isinstance(effet, dict):
            continue
        etype = effet.get("type")
        try:
            if etype == "points" and cibles:
                valeur = int(effet.get("valeur") or 0)
                if valeur:
                    await ajuster_points(maison_id, cibles, valeur, motif=f"gage:{source_titre}")
                    descriptions.append(f"{'+' if valeur > 0 else ''}{valeur} points")
            elif etype == "tache" and cibles:
                titre = (str(effet.get("titre") or "").strip()) or "Gage"
                jours = int(effet.get("jours") or 0)
                for c in cibles:
                    await _creer_tache_gage(c, titre, jours, maison_id, source_titre, createur_id)
                descriptions.append(f"tâche « {titre} »")
            elif etype == "amende" and cibles:
                montant = float(effet.get("montant") or 0)
                if montant > 0:
                    for c in cibles:
                        await _creer_amende(c, montant, maison_id, source_titre)
                    descriptions.append(f"amende {montant:.2f} €")
            elif etype == "note":
                texte = (str(effet.get("texte") or "").strip())
                if texte:
                    descriptions.append(texte)
        except Exception as exc:  # noqa: BLE001 — un effet ne doit pas bloquer les autres
            logger.warning("Effet de gage échoué (type=%s): %s", etype, exc)

    if descriptions and cibles and notifier_cibles:
        await notifier(
            cibles,
            type="tache",
            titre="⚖️ Gage appliqué",
            message=f"« {source_titre} » : " + ", ".join(descriptions),
            maison_id=maison_id,
            lien="tache",
        )
    return descriptions
