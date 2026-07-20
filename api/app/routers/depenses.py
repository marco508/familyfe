# app/routers/depenses.py — Dépenses partagées + bilan (ANNEXE V3)
from collections import defaultdict
from datetime import datetime

from app.utils.datetimes import naive_utc
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.database import database, depense_parts, depenses
from app.dependencies import get_current_user, require_membre, require_not_visiteur
from app.models.schemas import DepenseCreateInput, DepenseUpdateInput
from app.services.notifications import notifier

router = APIRouter(tags=["depenses"])


def _to_decimal(montant) -> Decimal:
    """Convertit un montant (float côté client) en Decimal exact à 2 décimales.
    Postgres (asyncpg) exige un Decimal pour une colonne Numeric."""
    return Decimal(str(montant)).quantize(Decimal("0.01"))


def _money_out(v):
    """Sérialise un montant en nombre JSON (float) — contrat API inchangé.
    Gère aussi bien un Decimal (Postgres) qu'un float (SQLite)."""
    return float(v) if v is not None else None


async def _parts_for(depense_id: int) -> list:
    rows = await database.fetch_all(
        depense_parts.select().where(depense_parts.c.depense_id == depense_id)
    )
    return [r["utilisateur_id"] for r in rows]


async def _valider_appartenance(maison_id: int, user_ids) -> None:
    """Vérifie que chaque id est bien membre de la maison (une seule requête
    groupée). Lève HTTP 400 si l'un d'eux n'appartient pas à la maison."""
    ids = list({uid for uid in (user_ids or []) if uid is not None})
    if not ids:
        return
    placeholders = ", ".join(f":uid_{i}" for i in range(len(ids)))
    values = {"mid": maison_id}
    for i, uid in enumerate(ids):
        values[f"uid_{i}"] = uid
    rows = await database.fetch_all(
        f"SELECT utilisateur_id FROM membres_maison "
        f"WHERE maison_id = :mid AND utilisateur_id IN ({placeholders})",
        values=values,
    )
    trouves = {r["utilisateur_id"] for r in rows}
    manquants = [uid for uid in ids if uid not in trouves]
    if manquants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un ou plusieurs utilisateurs ne sont pas membres de la maison",
        )


async def _get_or_404(depense_id: int) -> dict:
    row = await database.fetch_one(depenses.select().where(depenses.c.id == depense_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dépense introuvable")
    return dict(row)


async def _serialize(row: dict) -> dict:
    data = dict(row)
    data["montant"] = _money_out(data.get("montant"))
    data["parts"] = await _parts_for(row["id"])
    return data


@router.get("/maisons/{maison_id}/depenses")
async def list_depenses(
    maison_id: int,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        depenses.select()
        .where(depenses.c.maison_id == maison_id)
        .order_by(depenses.c.date.desc())
        .limit(limit)
        .offset(offset)
    )
    return [await _serialize(dict(r)) for r in rows]


@router.post("/maisons/{maison_id}/depenses", status_code=status.HTTP_201_CREATED)
async def create_depense(
    maison_id: int, data: DepenseCreateInput, current_user: dict = Depends(get_current_user)
):
    await require_not_visiteur(maison_id, current_user["id"], "Un visiteur ne peut pas créer de dépense")

    # Valide que le payeur et les participants explicites appartiennent à la maison.
    a_valider = set(data.participants or [])
    if data.paye_par is not None:
        a_valider.add(data.paye_par)
    await _valider_appartenance(maison_id, a_valider)

    paye_par = data.paye_par or current_user["id"]
    participants = data.participants
    if not participants:
        member_rows = await database.fetch_all(
            "SELECT utilisateur_id FROM membres_maison WHERE maison_id = :mid", values={"mid": maison_id}
        )
        participants = [m["utilisateur_id"] for m in member_rows]

    # Création atomique : la dépense et ses parts doivent apparaître ensemble.
    async with database.transaction():
        depense_id = await database.execute(
            depenses.insert().values(
                maison_id=maison_id,
                titre=data.titre,
                montant=_to_decimal(data.montant),
                paye_par=paye_par,
                # Colonne TIMESTAMP naïve : le client peut envoyer de l'UTC aware.
                date=naive_utc(data.date) or datetime.utcnow(),
                categorie=data.categorie,
                description=data.description,
            )
        )
        for uid in set(participants):
            await database.execute(
                depense_parts.insert().values(depense_id=depense_id, utilisateur_id=uid)
            )

    # ANNEXE V8 — seuls les PARTICIPANTS sont notifiés : une dépense ne concerne
    # que ceux qui la partagent, pas tout le foyer. Le montant et le payeur sont
    # dans le message, pour décider d'ouvrir l'app sans avoir à le faire.
    # Hors transaction : une notification ratée n'annule pas une dépense.
    payeur = await database.fetch_one(
        "SELECT nom FROM utilisateurs WHERE id = :uid", values={"uid": paye_par}
    )
    payeur_nom = payeur["nom"] if payeur else "quelqu'un"
    await notifier(
        set(participants),
        type="depense",
        titre="💶 Nouvelle dépense",
        message=f"{data.titre} — {float(_to_decimal(data.montant)):.2f} € payés par {payeur_nom}",
        maison_id=maison_id,
        lien=f"depense:{depense_id}",
        exclure=current_user["id"],
    )

    return await _serialize(await _get_or_404(depense_id))


@router.put("/depenses/{depense_id}")
async def update_depense(
    depense_id: int, data: DepenseUpdateInput, current_user: dict = Depends(get_current_user)
):
    row = await _get_or_404(depense_id)
    await require_membre(row["maison_id"], current_user["id"])

    # Valide que le payeur et les participants explicites appartiennent à la maison.
    a_valider = set(data.participants or [])
    if data.paye_par is not None:
        a_valider.add(data.paye_par)
    await _valider_appartenance(row["maison_id"], a_valider)

    values = {}
    if data.titre is not None:
        values["titre"] = data.titre
    if data.montant is not None:
        values["montant"] = _to_decimal(data.montant)
    if data.paye_par is not None:
        values["paye_par"] = data.paye_par
    if data.date is not None:
        values["date"] = naive_utc(data.date)
    if data.categorie is not None:
        values["categorie"] = data.categorie
    if data.description is not None:
        values["description"] = data.description

    # Mise à jour atomique de la dépense et de la réattribution des parts.
    async with database.transaction():
        if values:
            await database.execute(
                depenses.update().where(depenses.c.id == depense_id).values(**values)
            )

        if data.participants is not None:
            await database.execute(
                depense_parts.delete().where(depense_parts.c.depense_id == depense_id)
            )
            for uid in set(data.participants):
                await database.execute(
                    depense_parts.insert().values(depense_id=depense_id, utilisateur_id=uid)
                )

    return await _serialize(await _get_or_404(depense_id))


@router.delete("/depenses/{depense_id}")
async def delete_depense(depense_id: int, current_user: dict = Depends(get_current_user)):
    row = await _get_or_404(depense_id)
    await require_membre(row["maison_id"], current_user["id"])
    # Suppression en cascade atomique : parts + dépense.
    async with database.transaction():
        await database.execute(depense_parts.delete().where(depense_parts.c.depense_id == depense_id))
        await database.execute(depenses.delete().where(depenses.c.id == depense_id))
    return {"message": "Dépense supprimée"}


@router.get("/maisons/{maison_id}/depenses/bilan")
async def bilan(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Calcule qui a payé, qui doit, le solde net de chacun, et une proposition
    de règlements simplifiée (appariement glouton débiteurs/créditeurs)."""
    await require_membre(maison_id, current_user["id"])

    dep_rows = await database.fetch_all(depenses.select().where(depenses.c.maison_id == maison_id))
    dep_rows = [dict(d) for d in dep_rows]

    # Charge TOUTES les parts en une seule requête (supprime le N+1 : avant, une
    # requête par dépense).
    parts_by_dep: dict = defaultdict(list)
    dep_ids = [d["id"] for d in dep_rows]
    if dep_ids:
        part_rows = await database.fetch_all(
            depense_parts.select().where(depense_parts.c.depense_id.in_(dep_ids))
        )
        for pr in part_rows:
            parts_by_dep[pr["depense_id"]].append(pr["utilisateur_id"])

    # Agrégation en Decimal (exacte) plutôt qu'en float.
    paye: dict = defaultdict(lambda: Decimal("0"))
    du: dict = defaultdict(lambda: Decimal("0"))
    for d in dep_rows:
        montant = Decimal(str(d["montant"]))
        paye[d["paye_par"]] += montant
        parts = parts_by_dep.get(d["id"], [])
        if not parts:
            continue
        share = (montant / Decimal(len(parts))).quantize(Decimal("0.01"))
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

    _CENT = Decimal("0.01")
    _ZERO = Decimal("0")
    soldes = []
    balances = {}
    nom_map = {}
    for m in member_rows:
        uid = m["id"]
        nom_map[uid] = m["nom"]
        p = paye.get(uid, _ZERO).quantize(_CENT)
        d_ = du.get(uid, _ZERO).quantize(_CENT)
        solde = (p - d_).quantize(_CENT)
        balances[uid] = solde
        # Sortie en float pour conserver le contrat JSON (nombres, pas de chaînes).
        soldes.append({
            "utilisateur_id": uid, "nom": m["nom"],
            "paye": float(p), "du": float(d_), "solde": float(solde),
        })

    creditors = sorted(
        [[uid, s] for uid, s in balances.items() if s > _CENT], key=lambda x: -x[1]
    )
    debtors = sorted(
        [[uid, -s] for uid, s in balances.items() if s < -_CENT], key=lambda x: -x[1]
    )

    reglements = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        d_uid, d_amt = debtors[i]
        c_uid, c_amt = creditors[j]
        montant = min(d_amt, c_amt).quantize(_CENT)
        if montant > _CENT:
            reglements.append(
                {
                    "de": d_uid,
                    "de_nom": nom_map.get(d_uid),
                    "vers": c_uid,
                    "vers_nom": nom_map.get(c_uid),
                    "montant": float(montant),
                }
            )
        debtors[i][1] -= montant
        creditors[j][1] -= montant
        if debtors[i][1] <= _CENT:
            i += 1
        if creditors[j][1] <= _CENT:
            j += 1

    return {"soldes": soldes, "reglements": reglements}
