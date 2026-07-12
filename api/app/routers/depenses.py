# app/routers/depenses.py — Dépenses partagées + bilan (ANNEXE V3)
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.database.database import database, depense_parts, depenses
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import DepenseCreateInput, DepenseUpdateInput

router = APIRouter(tags=["depenses"])


async def _parts_for(depense_id: int) -> list:
    rows = await database.fetch_all(
        depense_parts.select().where(depense_parts.c.depense_id == depense_id)
    )
    return [r["utilisateur_id"] for r in rows]


async def _get_or_404(depense_id: int) -> dict:
    row = await database.fetch_one(depenses.select().where(depenses.c.id == depense_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dépense introuvable")
    return dict(row)


async def _serialize(row: dict) -> dict:
    data = dict(row)
    data["parts"] = await _parts_for(row["id"])
    return data


@router.get("/maisons/{maison_id}/depenses")
async def list_depenses(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        depenses.select().where(depenses.c.maison_id == maison_id).order_by(depenses.c.date.desc())
    )
    return [await _serialize(dict(r)) for r in rows]


@router.post("/maisons/{maison_id}/depenses", status_code=status.HTTP_201_CREATED)
async def create_depense(
    maison_id: int, data: DepenseCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer de dépense")

    paye_par = data.paye_par or current_user["id"]
    participants = data.participants
    if not participants:
        member_rows = await database.fetch_all(
            "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid", values={"mid": maison_id}
        )
        participants = [m["utilisateur_id"] for m in member_rows]

    depense_id = await database.execute(
        depenses.insert().values(
            maison_id=maison_id,
            titre=data.titre,
            montant=data.montant,
            paye_par=paye_par,
            date=data.date or datetime.utcnow(),
            categorie=data.categorie,
            description=data.description,
        )
    )
    for uid in set(participants):
        await database.execute(depense_parts.insert().values(depense_id=depense_id, utilisateur_id=uid))

    return await _serialize(await _get_or_404(depense_id))


@router.put("/depenses/{depense_id}")
async def update_depense(
    depense_id: int, data: DepenseUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_or_404(depense_id)
    await require_membre(row["maison_id"], current_user["id"])

    values = {}
    if data.titre is not None:
        values["titre"] = data.titre
    if data.montant is not None:
        values["montant"] = data.montant
    if data.paye_par is not None:
        values["paye_par"] = data.paye_par
    if data.date is not None:
        values["date"] = data.date
    if data.categorie is not None:
        values["categorie"] = data.categorie
    if data.description is not None:
        values["description"] = data.description

    if values:
        await database.execute(depenses.update().where(depenses.c.id == depense_id).values(**values))

    if data.participants is not None:
        await database.execute(depense_parts.delete().where(depense_parts.c.depense_id == depense_id))
        for uid in set(data.participants):
            await database.execute(
                depense_parts.insert().values(depense_id=depense_id, utilisateur_id=uid)
            )

    return await _serialize(await _get_or_404(depense_id))


@router.delete("/depenses/{depense_id}")
async def delete_depense(depense_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_or_404(depense_id)
    await require_membre(row["maison_id"], current_user["id"])
    await database.execute(depense_parts.delete().where(depense_parts.c.depense_id == depense_id))
    await database.execute(depenses.delete().where(depenses.c.id == depense_id))
    return {"message": "Dépense supprimée"}


@router.get("/maisons/{maison_id}/depenses/bilan")
async def bilan(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Calcule qui a payé, qui doit, le solde net de chacun, et une proposition
    de règlements simplifiée (appariement glouton débiteurs/créditeurs)."""
    await require_membre(maison_id, current_user["id"])

    dep_rows = await database.fetch_all(depenses.select().where(depenses.c.maison_id == maison_id))
    paye: dict = defaultdict(float)
    du: dict = defaultdict(float)
    for d in dep_rows:
        d = dict(d)
        paye[d["paye_par"]] += float(d["montant"])
        parts = await _parts_for(d["id"])
        if not parts:
            continue
        share = float(d["montant"]) / len(parts)
        for uid in parts:
            du[uid] += share

    member_rows = await database.fetch_all(
        """
        SELECT u.id, u.nom FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid
        """,
        values={"mid": maison_id},
    )

    soldes = []
    balances = {}
    nom_map = {}
    for m in member_rows:
        uid = m["id"]
        nom_map[uid] = m["nom"]
        p = round(paye.get(uid, 0.0), 2)
        d_ = round(du.get(uid, 0.0), 2)
        solde = round(p - d_, 2)
        balances[uid] = solde
        soldes.append({"utilisateur_id": uid, "nom": m["nom"], "paye": p, "du": d_, "solde": solde})

    creditors = sorted(
        [[uid, s] for uid, s in balances.items() if s > 0.01], key=lambda x: -x[1]
    )
    debtors = sorted(
        [[uid, -s] for uid, s in balances.items() if s < -0.01], key=lambda x: -x[1]
    )

    reglements = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        d_uid, d_amt = debtors[i]
        c_uid, c_amt = creditors[j]
        montant = round(min(d_amt, c_amt), 2)
        if montant > 0.01:
            reglements.append(
                {
                    "de": d_uid,
                    "de_nom": nom_map.get(d_uid),
                    "vers": c_uid,
                    "vers_nom": nom_map.get(c_uid),
                    "montant": montant,
                }
            )
        debtors[i][1] -= montant
        creditors[j][1] -= montant
        if debtors[i][1] <= 0.01:
            i += 1
        if creditors[j][1] <= 0.01:
            j += 1

    return {"soldes": soldes, "reglements": reglements}
