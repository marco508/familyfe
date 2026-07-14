# app/routers/stats.py
# ANNEXE V6 — Moteur d'équité, séries (streaks) et bilan hebdomadaire.
# Ces stats sont calculées à la volée depuis `tache_validations` (tâches
# validées) et `points_log` (points gagnés/perdus). Objectif produit :
#  - Équité : visualiser et rééquilibrer la charge du foyer.
#  - Streak : récompenser la régularité (habitude quotidienne).
#  - Bilan : récap motivant de la semaine.
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query

from app.database.database import database
from app.dependencies import get_current_user, require_membre

router = APIRouter(tags=["stats"])


def _cutoff_iso(periode: str) -> str | None:
    """Retourne la borne basse ISO selon la période (None = depuis toujours)."""
    if periode == "semaine":
        return (datetime.now() - timedelta(days=7)).isoformat()
    if periode == "mois":
        return (datetime.now() - timedelta(days=30)).isoformat()
    return None


async def _membres_actifs(maison_id: int) -> list[dict]:
    """Membres du foyer participant à la charge (on exclut les visiteurs)."""
    rows = await database.fetch_all(
        """
        SELECT u.id, u.nom, u.image
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid AND mm.role != 'visiteur'
        ORDER BY u.nom ASC
        """,
        values={"mid": maison_id},
    )
    return [dict(r) for r in rows]


@router.get("/maisons/{maison_id}/equite")
async def equite(
    maison_id: int,
    periode: str = Query("semaine"),
    current_user: dict = Depends(get_current_user),
):
    """Moteur d'équité : part de la charge (tâches validées) par membre sur la
    période, moyenne attendue, déséquilibre éventuel, et suggestion du prochain
    volontaire (celui qui a le moins contribué)."""
    await require_membre(maison_id, current_user["id"])
    cutoff = _cutoff_iso(periode)
    membres = await _membres_actifs(maison_id)

    # Nombre de tâches validées par membre sur la période.
    q = """
        SELECT tv.utilisateur_id AS uid, COUNT(*) AS n
        FROM tache_validations tv
        JOIN taches t ON t.id = tv.tache_id
        WHERE t.maison_id = :mid
    """
    vals = {"mid": maison_id}
    if cutoff:
        q += " AND tv.date_creation >= :cut"
        vals["cut"] = cutoff
    q += " GROUP BY tv.utilisateur_id"
    faites_rows = await database.fetch_all(q, values=vals)
    faites = {r["uid"]: r["n"] for r in faites_rows}

    # Points gagnés sur la période (net).
    pq = "SELECT utilisateur_id AS uid, COALESCE(SUM(delta),0) AS pts FROM points_log WHERE maison_id = :mid"
    pvals = {"mid": maison_id}
    if cutoff:
        pq += " AND date_creation >= :cut"
        pvals["cut"] = cutoff
    pq += " GROUP BY utilisateur_id"
    points_rows = await database.fetch_all(pq, values=pvals)
    points = {r["uid"]: r["pts"] for r in points_rows}

    total = sum(faites.get(m["id"], 0) for m in membres)
    nb = len(membres) or 1
    moyenne_pct = round(100 / nb, 1)

    result = []
    for m in membres:
        n = faites.get(m["id"], 0)
        part = round((n / total) * 100, 1) if total > 0 else 0.0
        result.append(
            {
                "utilisateur_id": m["id"],
                "nom": m["nom"],
                "image": m["image"],
                "taches_faites": n,
                "points": points.get(m["id"], 0),
                "part_pct": part,
            }
        )

    # Tri par contribution décroissante (le plus impliqué en tête).
    result.sort(key=lambda x: x["taches_faites"], reverse=True)

    # Déséquilibre : écart max de part > 25 points de pourcentage (et assez de
    # données pour que ce soit significatif).
    parts = [r["part_pct"] for r in result] or [0]
    desequilibre = total >= 3 and (max(parts) - min(parts) > 25)

    # Suggestion : le membre ayant le moins contribué (pour la prochaine tâche).
    suggestion = None
    if len(result) > 1 and total > 0:
        moins = min(result, key=lambda x: x["taches_faites"])
        suggestion = {"utilisateur_id": moins["utilisateur_id"], "nom": moins["nom"], "image": moins["image"]}

    return {
        "periode": periode,
        "total_taches": total,
        "moyenne_pct": moyenne_pct,
        "desequilibre": bool(desequilibre),
        "suggestion": suggestion,
        "membres": result,
    }


@router.get("/maisons/{maison_id}/streak")
async def streak(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Série de l'appelant : nombre de jours consécutifs (jusqu'à aujourd'hui ou
    hier) où il a validé au moins une tâche dans ce foyer."""
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        """
        SELECT DISTINCT DATE(tv.date_creation) AS jour
        FROM tache_validations tv
        JOIN taches t ON t.id = tv.tache_id
        WHERE t.maison_id = :mid AND tv.utilisateur_id = :uid
        ORDER BY jour DESC
        """,
        values={"mid": maison_id, "uid": current_user["id"]},
    )
    jours = set()
    for r in rows:
        try:
            jours.add(date.fromisoformat(str(r["jour"])[:10]))
        except (ValueError, TypeError):
            continue

    today = date.today()
    # La série reste valide si la dernière activité est aujourd'hui ou hier.
    if today not in jours and (today - timedelta(days=1)) not in jours:
        return {"streak": 0, "actif_aujourdhui": False}

    start = today if today in jours else today - timedelta(days=1)
    n = 0
    cur = start
    while cur in jours:
        n += 1
        cur = cur - timedelta(days=1)
    return {"streak": n, "actif_aujourdhui": today in jours}


@router.get("/maisons/{maison_id}/bilan-semaine")
async def bilan_semaine(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Bilan motivant des 7 derniers jours : total de tâches, top membre,
    répartition, points de la semaine."""
    await require_membre(maison_id, current_user["id"])
    cutoff = (datetime.now() - timedelta(days=7)).isoformat()

    membres = await _membres_actifs(maison_id)
    faites_rows = await database.fetch_all(
        """
        SELECT tv.utilisateur_id AS uid, COUNT(*) AS n
        FROM tache_validations tv
        JOIN taches t ON t.id = tv.tache_id
        WHERE t.maison_id = :mid AND tv.date_creation >= :cut
        GROUP BY tv.utilisateur_id
        """,
        values={"mid": maison_id, "cut": cutoff},
    )
    faites = {r["uid"]: r["n"] for r in faites_rows}

    points_row = await database.fetch_one(
        "SELECT COALESCE(SUM(delta),0) AS pts FROM points_log WHERE maison_id = :mid AND date_creation >= :cut",
        values={"mid": maison_id, "cut": cutoff},
    )

    par_membre = [
        {"utilisateur_id": m["id"], "nom": m["nom"], "image": m["image"], "taches": faites.get(m["id"], 0)}
        for m in membres
    ]
    par_membre.sort(key=lambda x: x["taches"], reverse=True)
    total = sum(x["taches"] for x in par_membre)
    top = par_membre[0] if par_membre and par_membre[0]["taches"] > 0 else None

    return {
        "total_taches": total,
        "points_semaine": points_row["pts"] if points_row else 0,
        "top": top,
        "par_membre": par_membre,
    }
