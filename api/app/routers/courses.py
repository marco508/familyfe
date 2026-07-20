# app/routers/courses.py — Liste de courses (ANNEXE V3)
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import courses_items, database
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import CourseItemCreateInput, CourseItemUpdateInput
from app.services.notifications import notifier_maison

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
async def list_courses(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        courses_items.select()
        .where(courses_items.c.maison_id == maison_id)
        .order_by(courses_items.c.achete.asc(), courses_items.c.date_creation.desc())
        .limit(limit)
        .offset(offset)
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

    # ANNEXE V8 — ANTI-SPAM. On remplit une liste de courses par rafales (« lait,
    # pain, œufs, café… ») : une notification par article, c'est 12 buzz en deux
    # minutes, et l'utilisateur coupe la catégorie — donc zéro notification.
    # Une notification par article serait pire que pas de notification du tout.
    #
    # D'où une clé d'idempotence à granularité JOUR + auteur + maison : le foyer
    # est prévenu au PREMIER article qu'une personne ajoute dans la journée, les
    # suivants sont silencieux (`notifier` voit la clé déjà posée et n'insère
    # rien). Deux personnes qui remplissent la liste le même jour = deux
    # notifications (c'est bien deux informations distinctes) ; une même personne
    # qui ajoute 12 articles = une seule.
    #
    # Le compromis assumé : un ajout tardif le soir, après une rafale du matin,
    # passe inaperçu. C'est le prix d'une liste de courses qui reste consultable
    # (l'article est dans la liste, le foyer sait déjà qu'elle bouge aujourd'hui).
    cle = f"course:{maison_id}:{current_user['id']}:{date.today().isoformat()}"
    await notifier_maison(
        maison_id,
        type="course",
        titre="🛒 Liste de courses",
        message=f"{current_user['nom']} a ajouté des articles, dont « {data.nom} »",
        lien=f"courses:{maison_id}",
        cle=cle,
        exclure=current_user["id"],
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
