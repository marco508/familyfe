# app/routers/users.py
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func as sa_func
from sqlalchemy import or_

from app.database.database import database, utilisateurs
from app.dependencies import get_current_user
from app.models.schemas import TelephonesInput
from app.utils.formatting import public_user
from app.utils.ratelimit import limiter

router = APIRouter(tags=["users"])


@router.get("/users/search")
@limiter.limit("30/minute")
async def search_users(
    request: Request,
    q: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
):
    """Recherche insensible à la casse sur nom/email/téléphone. Exclut l'appelant. Limite 20."""
    like = f"%{q.strip().lower()}%"
    query = (
        utilisateurs.select()
        .where(
            utilisateurs.c.id != current_user["id"],
            or_(
                sa_func.lower(utilisateurs.c.nom).like(like),
                sa_func.lower(utilisateurs.c.email).like(like),
                sa_func.lower(utilisateurs.c.telephone).like(like),
            ),
        )
        .limit(20)
    )
    rows = await database.fetch_all(query)
    return [public_user(r) for r in rows]


@router.post("/users/search/telephones")
@limiter.limit("20/minute")
async def search_users_by_telephones(
    request: Request,
    data: TelephonesInput,
    current_user: dict = Depends(get_current_user),
):
    """Match exact sur une liste de numéros (issus des contacts du téléphone)."""
    telephones = [t for t in data.telephones if t]
    if not telephones:
        return []

    query = utilisateurs.select().where(
        utilisateurs.c.telephone.in_(telephones),
        utilisateurs.c.id != current_user["id"],
    )
    rows = await database.fetch_all(query)
    return [public_user(r) for r in rows]
