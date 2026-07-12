# app/routers/courses.py — Liste de courses (ANNEXE V3)
from fastapi import APIRouter, Depends, HTTPException, status

from app.database.database import courses_items, database
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import CourseItemCreateInput, CourseItemUpdateInput

router = APIRouter(tags=["courses"])


def _serialize(row) -> dict:
    data = dict(row)
    data["achete"] = bool(data.get("achete"))
    return data


async def _get_item_or_404(item_id: int) -> dict:
    row = await database.fetch_one(courses_items.select().where(courses_items.c.id == item_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article introuvable")
    return dict(row)


@router.get("/maisons/{maison_id}/courses")
async def list_courses(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        courses_items.select()
        .where(courses_items.c.maison_id == maison_id)
        .order_by(courses_items.c.achete.asc(), courses_items.c.date_creation.desc())
    )
    return [_serialize(r) for r in rows]


@router.post("/maisons/{maison_id}/courses", status_code=status.HTTP_201_CREATED)
async def create_course(
    maison_id: int, data: CourseItemCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas ajouter d'article")
    item_id = await database.execute(
        courses_items.insert().values(
            maison_id=maison_id,
            nom=data.nom,
            quantite=data.quantite,
            categorie=data.categorie,
            achete=False,
            ajoute_par=current_user["id"],
        )
    )
    return _serialize(await _get_item_or_404(item_id))


@router.patch("/courses/{item_id}")
async def update_course(
    item_id: int, data: CourseItemUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_item_or_404(item_id)
    await require_membre(row["maison_id"], current_user["id"])

    values = {}
    if data.nom is not None:
        values["nom"] = data.nom
    if data.quantite is not None:
        values["quantite"] = data.quantite
    if data.categorie is not None:
        values["categorie"] = data.categorie
    if data.achete is not None:
        values["achete"] = bool(data.achete)
        values["achete_par"] = current_user["id"] if data.achete else None

    if values:
        await database.execute(courses_items.update().where(courses_items.c.id == item_id).values(**values))

    return _serialize(await _get_item_or_404(item_id))


@router.delete("/courses/{item_id}")
async def delete_course(item_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_item_or_404(item_id)
    await require_membre(row["maison_id"], current_user["id"])
    await database.execute(courses_items.delete().where(courses_items.c.id == item_id))
    return {"message": "Article supprimé"}


@router.delete("/maisons/{maison_id}/courses/achetes")
async def clear_achetes(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    await database.execute(
        courses_items.delete().where(
            (courses_items.c.maison_id == maison_id) & (courses_items.c.achete == True)  # noqa: E712
        )
    )
    return {"message": "Articles achetés supprimés"}
