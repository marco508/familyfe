# app/routers/repas.py — Menu de la semaine (ANNEXE V3)
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import courses_items, database, repas
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import RepasCreateInput, RepasUpdateInput, RepasVersCoursesInput
from app.services.notifications import notifier_maison

router = APIRouter(tags=["repas"])

VALID_MOMENTS = {"petit_dej", "midi", "soir"}

# Libellés lisibles des moments, pour les notifications.
MOMENT_LABELS = {"petit_dej": "petit-déjeuner", "midi": "midi", "soir": "soir"}


async def _get_or_404(repas_id: int) -> dict:
    row = await database.fetch_one(repas.select().where(repas.c.id == repas_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repas introuvable")
    return dict(row)


@router.get("/maisons/{maison_id}/repas")
async def list_repas(
    maison_id: int,
    debut: Optional[str] = Query(None),
    fin: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    query = repas.select().where(repas.c.maison_id == maison_id)
    if debut:
        query = query.where(repas.c.date >= debut)
    if fin:
        query = query.where(repas.c.date <= fin)
    query = query.order_by(repas.c.date.asc()).limit(limit).offset(offset)
    rows = await database.fetch_all(query)
    return [dict(r) for r in rows]


@router.post("/maisons/{maison_id}/repas", status_code=status.HTTP_201_CREATED)
async def create_repas(maison_id: int, data: RepasCreateInput, current_user: dict = Depends(get_current_user)):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas ajouter de repas")
    if data.moment not in VALID_MOMENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Moment invalide")

    repas_id = await database.execute(
        repas.insert().values(
            maison_id=maison_id, date=data.date, moment=data.moment, titre=data.titre, notes=data.notes
        )
    )

    # ANNEXE V8 — le menu concerne tout le foyer (savoir ce qu'on mange, et
    # qu'on n'a pas à s'en occuper). Pas d'anti-spam ici, contrairement aux
    # courses : on planifie un repas à la fois, pas par rafales de douze.
    await notifier_maison(
        maison_id,
        type="repas",
        titre="🍽️ Repas planifié",
        message=f"{data.titre} — {data.date} ({MOMENT_LABELS.get(data.moment, data.moment)})",
        lien=f"repas:{repas_id}",
        exclure=current_user["id"],
    )

    return await _get_or_404(repas_id)


@router.put("/repas/{repas_id}")
async def update_repas(repas_id: int, data: RepasUpdateInput, current_user: dict = Depends(get_current_user)):
    row = await _get_or_404(repas_id)
    await require_membre(row["maison_id"], current_user["id"])

    if data.moment is not None and data.moment not in VALID_MOMENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Moment invalide")

    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if values:
        await database.execute(repas.update().where(repas.c.id == repas_id).values(**values))

    return await _get_or_404(repas_id)


@router.delete("/repas/{repas_id}")
async def delete_repas(repas_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_or_404(repas_id)
    await require_membre(row["maison_id"], current_user["id"])
    await database.execute(repas.delete().where(repas.c.id == repas_id))
    return {"message": "Repas supprimé"}


@router.post("/repas/{repas_id}/vers-courses")
async def repas_vers_courses(
    repas_id: int, data: RepasVersCoursesInput, current_user: dict = Depends(get_current_user)
):
    """Génère des articles de courses depuis les ingrédients d'un repas."""
    row = await _get_or_404(repas_id)
    await require_membre(row["maison_id"], current_user["id"])

    created = []
    for nom in data.items:
        nom = (nom or "").strip()
        if not nom:
            continue
        item_id = await database.execute(
            courses_items.insert().values(
                maison_id=row["maison_id"], nom=nom, achete=False, ajoute_par=current_user["id"]
            )
        )
        item = await database.fetch_one(courses_items.select().where(courses_items.c.id == item_id))
        d = dict(item)
        d["achete"] = bool(d.get("achete"))
        created.append(d)
    return created
