# app/routers/notifications.py
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, notifications
from app.dependencies import get_current_user
from app.services.notifications import notifier

router = APIRouter(tags=["notifications"])


async def _generer_anniversaires_du_jour(user_id: int) -> None:
    """Crée (une fois par jour) une notification pour chaque anniversaire du jour
    dans les maisons de l'utilisateur. Idempotent via la clé `anniv:<uid>:<AAAA-MM-JJ>`.
    """
    today = date.today()
    rows = await database.fetch_all(
        """
        SELECT DISTINCT u.id, u.nom, u.date_naissance, mm.maison_id
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id IN (
            SELECT maison_id FROM membres_maison WHERE utilisateur_id = :uid
        )
        AND u.date_naissance IS NOT NULL
        """,
        values={"uid": user_id},
    )
    for r in rows:
        dn = r["date_naissance"]
        try:
            d = dn if isinstance(dn, date) else date.fromisoformat(str(dn)[:10])
        except (ValueError, TypeError):
            continue
        if d.month == today.month and d.day == today.day:
            cle = f"anniv:{r['id']}:{today.isoformat()}"
            # Notifie les membres de la maison concernée (y compris la personne).
            membre_rows = await database.fetch_all(
                "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid",
                values={"mid": r["maison_id"]},
            )
            dest = [m["utilisateur_id"] for m in membre_rows]
            est_moi = r["id"] == user_id
            await notifier(
                dest,
                type="anniversaire",
                titre="🎂 Anniversaire aujourd'hui",
                message=(
                    "C'est votre anniversaire, joyeux anniversaire ! 🎉"
                    if est_moi
                    else f"C'est l'anniversaire de {r['nom']} aujourd'hui ! 🎉"
                ),
                maison_id=r["maison_id"],
                lien="maison",
                cle=cle,
            )


@router.get("/notifications")
async def list_notifications(
    non_lues: bool = Query(False),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    # Surface les anniversaires du jour à l'ouverture du centre de notifications.
    await _generer_anniversaires_du_jour(current_user["id"])

    query = "SELECT * FROM notifications WHERE utilisateur_id = :uid"
    if non_lues:
        query += " AND lu = 0"
    query += " ORDER BY date_creation DESC, id DESC LIMIT :lim"
    rows = await database.fetch_all(query, values={"uid": current_user["id"], "lim": limit})
    result = []
    for r in rows:
        d = dict(r)
        d["lu"] = bool(d.get("lu"))
        result.append(d)
    return result


@router.get("/notifications/compteur")
async def compteur_non_lues(current_user: dict = Depends(get_current_user)):
    await _generer_anniversaires_du_jour(current_user["id"])
    row = await database.fetch_one(
        "SELECT COUNT(*) AS n FROM notifications WHERE utilisateur_id = :uid AND lu = 0",
        values={"uid": current_user["id"]},
    )
    return {"non_lues": row["n"] if row else 0}


@router.post("/notifications/{notif_id}/lu")
async def marquer_lu(notif_id: int, current_user: dict = Depends(get_current_user)):
    row = await database.fetch_one(
        notifications.select().where(notifications.c.id == notif_id)
    )
    if not row or row["utilisateur_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification introuvable")
    await database.execute(
        notifications.update().where(notifications.c.id == notif_id).values(lu=True)
    )
    return {"message": "Notification lue"}


@router.post("/notifications/lu-tout")
async def marquer_tout_lu(current_user: dict = Depends(get_current_user)):
    await database.execute(
        "UPDATE notifications SET lu = 1 WHERE utilisateur_id = :uid",
        values={"uid": current_user["id"]},
    )
    return {"message": "Toutes les notifications sont lues"}


@router.delete("/notifications/{notif_id}")
async def supprimer_notification(notif_id: int, current_user: dict = Depends(get_current_user)):
    row = await database.fetch_one(
        notifications.select().where(notifications.c.id == notif_id)
    )
    if not row or row["utilisateur_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification introuvable")
    await database.execute(notifications.delete().where(notifications.c.id == notif_id))
    return {"message": "Notification supprimée"}
