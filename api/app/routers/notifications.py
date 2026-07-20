# app/routers/notifications.py
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, notifications
from app.dependencies import get_current_user

router = APIRouter(tags=["notifications"])


# Les notifications d'anniversaire sont désormais générées par le scheduler
# (app/services/scheduler.py), plus à chaque consultation du centre de
# notifications ni à chaque appel du compteur (qui relançait un scan complet).


@router.get("/notifications")
async def list_notifications(
    non_lues: bool = Query(False),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    maison_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    query = "SELECT * FROM notifications WHERE utilisateur_id = :uid"
    values = {"uid": current_user["id"], "lim": limit, "off": offset}
    if maison_id is not None:
        # Centre de notifications scopé à la maison ACTIVE : un utilisateur membre
        # de plusieurs maisons ne voit pas les deux flux mélangés. Les notifs
        # sans maison (niveau compte) restent visibles quelle que soit la maison.
        query += " AND (maison_id = :mid OR maison_id IS NULL)"
        values["mid"] = maison_id
    if non_lues:
        # `lu` est un vrai booléen en Postgres : « lu = 0 » y provoque
        # « operator does not exist: boolean = integer ». On écrit FALSE/TRUE,
        # que SQLite comprend aussi (alias de 0/1). SQLite n'avait jamais levé
        # l'erreur car ses booléens SONT des entiers — d'où le bug invisible en
        # dev et révélé seulement sur le VPS.
        query += " AND lu = FALSE"
    query += " ORDER BY date_creation DESC, id DESC LIMIT :lim OFFSET :off"
    rows = await database.fetch_all(query, values=values)
    result = []
    for r in rows:
        d = dict(r)
        d["lu"] = bool(d.get("lu"))
        result.append(d)
    return result


@router.get("/notifications/compteur")
async def compteur_non_lues(
    maison_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    query = "SELECT COUNT(*) AS n FROM notifications WHERE utilisateur_id = :uid AND lu = FALSE"
    values = {"uid": current_user["id"]}
    if maison_id is not None:
        query += " AND (maison_id = :mid OR maison_id IS NULL)"
        values["mid"] = maison_id
    row = await database.fetch_one(query, values=values)
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
async def marquer_tout_lu(
    maison_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    # « Tout marquer lu » scopé à la maison active (cohérent avec la liste/le
    # badge) : ne vide pas le flux des autres maisons de l'utilisateur.
    query = "UPDATE notifications SET lu = TRUE WHERE utilisateur_id = :uid"
    values = {"uid": current_user["id"]}
    if maison_id is not None:
        query += " AND (maison_id = :mid OR maison_id IS NULL)"
        values["mid"] = maison_id
    await database.execute(query, values=values)
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
