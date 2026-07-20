# app/routers/maisons.py
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.utils.ratelimit import limiter

from app.database.database import (
    activite_assignations,
    activite_commentaires,
    activite_participants,
    activite_sous_taches,
    activites,
    boutique_recompenses,
    database,
    defi_participants,
    defis,
    depense_parts,
    depenses,
    evenement_reponses,
    evenements,
    maisons,
    membres_maison,
    messages,
    pieces,
    points_log,
    recompense_echanges,
    regles,
    repas as repas_table,
    courses_items,
    tache_validations,
    tache_pieces,
    taches,
    utilisateurs,
    vote_bulletins,
    vote_options,
    votes,
)
from app.dependencies import (
    get_current_user,
    get_maison_or_404,
    get_role_in_maison,
    require_chef,
    require_gestion,
    require_membre,
)
from app.models.schemas import (
    ChefTemporaireInput,
    MaisonCreateInput,
    MaisonJoinInput,
    MaisonUpdateInput,
    MembreAddInput,
    RoleUpdateInput,
    TransfererChefInput,
    VisiteurInput,
)
from app.services.notifications import membres_ids, notifier, notifier_maison
from app.services.regles_rappel import rappeler_regles
from app.utils.codes import generate_unique_code_invitation
from app.utils.datetimes import naive_utc
from app.utils.formatting import public_user

router = APIRouter(tags=["maisons"])

# Libellés lisibles des rôles, pour les notifications (le code technique
# 'co_chef' n'a rien à faire sous les yeux d'un utilisateur).
ROLE_LABELS = {
    "chef": "chef",
    "co_chef": "co-chef",
    "chef_temporaire": "chef temporaire",
    "membre": "membre",
    "visiteur": "visiteur",
}

VALID_ROLES_SET = {"co_chef", "chef_temporaire", "membre", "visiteur"}
VALID_LIENS_FAMILLE = {"pere", "mere", "enfant", "frere", "soeur", "conjoint", "autre"}

MEMBRE_FIELDS_SQL = """
    SELECT u.id, u.nom, u.email, u.telephone, u.image, mm.role, mm.points, mm.est_enfant,
           mm.lien_famille, mm.role_expire_le, mm.visite_expire_le, mm.regles_vues_le, mm.date_ajout
"""


def _serialize_membre(row: dict) -> dict:
    d = dict(row)
    d["est_enfant"] = bool(d.get("est_enfant"))
    return d


# ANNEXE V7 — Découverte progressive.
# Modules optionnels activables par le foyer. Volontairement PAS dans cette
# liste (donc toujours actifs, non désactivables) : Aujourd'hui, Tâches, Agenda,
# Équité, Logement, Inviter, Réglages — c'est le cœur, sans eux l'app n'existe
# pas.
MODULES_CONNUS = ["courses", "depenses", "decisions", "jeu", "portefeuille", "chat"]


def _serialize_maison(row) -> dict:
    """Expose `modules` en LISTE (stocké en CSV côté base).

    Le client lit `maison.modules` comme un tableau ; garder le CSV en base
    évite une table de jointure pour une donnée aussi simple.
    """
    d = dict(row)
    brut = d.get("modules")
    if brut is None:
        # Colonne absente du SELECT : on ne devine pas, on renvoie une liste
        # vide plutôt qu'un `None` qui ferait planter le client.
        d["modules"] = []
    else:
        d["modules"] = [m for m in str(brut).split(",") if m in MODULES_CONNUS]
    return d


@router.post("/maisons", status_code=status.HTTP_201_CREATED)
async def create_maison(data: MaisonCreateInput, current_user: dict = Depends(get_current_user)):
    """Crée une maison. L'appelant devient chef + membre."""
    code = await generate_unique_code_invitation()
    maison_id = await database.execute(
        maisons.insert().values(
            nom=data.nom,
            code_invitation=code,
            chef_id=current_user["id"],
            emoji=data.emoji or "🏠",
            couleur=data.couleur or "#FF4E9B",
            # ANNEXE V7 — découverte progressive : un foyer NEUF démarre sans
            # aucun module optionnel (seuls Aujourd'hui, Tâches, Agenda et
            # Équité existent). On écrit explicitement "" pour ne PAS hériter du
            # server_default, qui vaut « tous les modules » et n'est là que pour
            # préserver les foyers déjà en base lors de la migration.
            modules="",
        )
    )
    await database.execute(
        membres_maison.insert().values(
            maison_id=maison_id, utilisateur_id=current_user["id"], role="chef"
        )
    )
    maison = await database.fetch_one(maisons.select().where(maisons.c.id == maison_id))
    result = _serialize_maison(maison)
    result["role"] = "chef"
    result["nb_membres"] = 1
    return result


@router.get("/maisons")
async def list_maisons(current_user: dict = Depends(get_current_user)):
    """Liste des maisons de l'appelant, avec son rôle et le nombre de membres."""
    query = """
        SELECT m.id, m.nom, m.code_invitation, m.chef_id, m.emoji, m.couleur, m.date_creation,
               m.type_logement, m.adresse, m.complement, m.code_postal, m.ville, m.pays,
               m.etage, m.numero_appartement, m.digicode, m.interphone, m.acces, m.surface,
               m.modules,
               mm.role AS role,
               (SELECT COUNT(*) FROM membres_maison WHERE maison_id = m.id) AS nb_membres
        FROM maisons m
        JOIN membres_maison mm ON mm.maison_id = m.id
        WHERE mm.utilisateur_id = :uid
        ORDER BY m.date_creation DESC
    """
    rows = await database.fetch_all(query, values={"uid": current_user["id"]})
    return [_serialize_maison(r) for r in rows]


@router.get("/portefeuille")
async def portefeuille(current_user: dict = Depends(get_current_user)):
    """ANNEXE V4 — Portefeuille immobilier : maisons dont l'appelant est chef
    (ou chef_temporaire), avec type_logement, résumé d'adresse, nb_pieces,
    nb_membres, surface."""
    rows = await database.fetch_all(
        """
        SELECT m.id, m.nom, m.emoji, m.couleur, m.type_logement, m.adresse, m.complement,
               m.code_postal, m.ville, m.pays, m.surface, mm.role,
               (SELECT COUNT(*) FROM membres_maison WHERE maison_id = m.id) AS nb_membres,
               (SELECT COUNT(*) FROM pieces WHERE maison_id = m.id) AS nb_pieces
        FROM maisons m
        JOIN membres_maison mm ON mm.maison_id = m.id
        WHERE mm.utilisateur_id = :uid AND mm.role IN ('chef', 'chef_temporaire')
        ORDER BY m.date_creation DESC
        """,
        values={"uid": current_user["id"]},
    )
    result = []
    for r in rows:
        d = dict(r)
        d["adresse_resume"] = ", ".join(
            [p for p in [d.get("code_postal"), d.get("ville")] if p]
        ) or None
        result.append(d)
    return result


@router.get("/maisons/{maison_id}")
async def get_maison(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Détail d'une maison + liste des membres + nb_pieces. 403 si l'appelant n'est pas membre."""
    role = await require_membre(maison_id, current_user["id"])
    maison = await get_maison_or_404(maison_id)

    membres_rows = await database.fetch_all(
        MEMBRE_FIELDS_SQL
        + """
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid
        ORDER BY mm.date_ajout ASC
        """,
        values={"mid": maison_id},
    )

    nb_pieces_row = await database.fetch_one(
        "SELECT COUNT(*) AS n FROM pieces WHERE maison_id = :mid", values={"mid": maison_id}
    )

    result = _serialize_maison(maison)
    result["role"] = role
    result["nb_pieces"] = nb_pieces_row["n"] if nb_pieces_row else 0
    result["membres"] = [_serialize_membre(r) for r in membres_rows]
    return result


@router.put("/maisons/{maison_id}")
async def update_maison(
    maison_id: int, data: MaisonUpdateInput, current_user: dict = Depends(get_current_user)
):
    """Maj nom/emoji/couleur (gestion : chef ou co-chef)."""
    await require_gestion(maison_id, current_user["id"])
    await get_maison_or_404(maison_id)

    values = {}
    if data.nom is not None:
        values["nom"] = data.nom
    if data.emoji is not None:
        values["emoji"] = data.emoji
    if data.couleur is not None:
        values["couleur"] = data.couleur
    # ANNEXE V4 — Adresse & logement
    if data.type_logement is not None:
        if data.type_logement not in ("maison", "appartement"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de logement invalide")
        values["type_logement"] = data.type_logement
    if data.adresse is not None:
        values["adresse"] = data.adresse
    if data.complement is not None:
        values["complement"] = data.complement
    if data.code_postal is not None:
        values["code_postal"] = data.code_postal
    if data.ville is not None:
        values["ville"] = data.ville
    if data.pays is not None:
        values["pays"] = data.pays
    if data.etage is not None:
        values["etage"] = data.etage
    if data.numero_appartement is not None:
        values["numero_appartement"] = data.numero_appartement
    if data.digicode is not None:
        values["digicode"] = data.digicode
    if data.interphone is not None:
        values["interphone"] = data.interphone
    if data.acces is not None:
        values["acces"] = data.acces
    if data.surface is not None:
        values["surface"] = data.surface
    # ANNEXE V7 — Découverte progressive : activation/désactivation des modules.
    # `[]` (tout désactiver) est légitime, d'où le test sur `is not None`.
    if data.modules is not None:
        inconnus = [m for m in data.modules if m not in MODULES_CONNUS]
        if inconnus:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Module(s) inconnu(s) : {', '.join(inconnus)}",
            )
        # dédoublonnage + ordre stable, pour un CSV déterministe en base.
        values["modules"] = ",".join([m for m in MODULES_CONNUS if m in set(data.modules)])

    if values:
        await database.execute(maisons.update().where(maisons.c.id == maison_id).values(**values))

    maison = await database.fetch_one(maisons.select().where(maisons.c.id == maison_id))
    return _serialize_maison(maison)


@router.delete("/maisons/{maison_id}")
async def delete_maison(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Supprime la maison + toutes ses dépendances (chef uniquement)."""
    await require_chef(maison_id, current_user["id"])
    await get_maison_or_404(maison_id)

    # Toute la cascade est atomique : une interruption ne peut plus laisser la
    # maison à moitié supprimée (données orphelines).
    async with database.transaction():
        # --- Activités (assignations, participants, sous-tâches, commentaires) ---
        activite_id_rows = await database.fetch_all(
            "SELECT id FROM activites WHERE maison_id = :mid", values={"mid": maison_id}
        )
        activite_ids = [r["id"] for r in activite_id_rows]
        if activite_ids:
            await database.execute(
                activite_assignations.delete().where(activite_assignations.c.activite_id.in_(activite_ids))
            )
            await database.execute(
                activite_participants.delete().where(activite_participants.c.activite_id.in_(activite_ids))
            )
            await database.execute(
                activite_sous_taches.delete().where(activite_sous_taches.c.activite_id.in_(activite_ids))
            )
            await database.execute(
                activite_commentaires.delete().where(activite_commentaires.c.activite_id.in_(activite_ids))
            )
        await database.execute(activites.delete().where(activites.c.maison_id == maison_id))

        # --- ANNEXE V4 : Tâches (+ validations) ---
        tache_id_rows = await database.fetch_all(
            "SELECT id FROM taches WHERE maison_id = :mid", values={"mid": maison_id}
        )
        tache_ids = [r["id"] for r in tache_id_rows]
        if tache_ids:
            await database.execute(tache_pieces.delete().where(tache_pieces.c.tache_id.in_(tache_ids)))
            await database.execute(tache_validations.delete().where(tache_validations.c.tache_id.in_(tache_ids)))
        await database.execute(taches.delete().where(taches.c.maison_id == maison_id))

        # --- ANNEXE V4 : Règles ---
        await database.execute(regles.delete().where(regles.c.maison_id == maison_id))

        # --- ANNEXE V4 : Pièces ---
        await database.execute(pieces.delete().where(pieces.c.maison_id == maison_id))

        # --- Votes ---
        vote_id_rows = await database.fetch_all(
            "SELECT id FROM votes WHERE maison_id = :mid", values={"mid": maison_id}
        )
        vote_ids = [r["id"] for r in vote_id_rows]
        if vote_ids:
            await database.execute(vote_bulletins.delete().where(vote_bulletins.c.vote_id.in_(vote_ids)))
            await database.execute(vote_options.delete().where(vote_options.c.vote_id.in_(vote_ids)))
        await database.execute(votes.delete().where(votes.c.maison_id == maison_id))

        # --- Événements (RSVP) ---
        evenement_id_rows = await database.fetch_all(
            "SELECT id FROM evenements WHERE maison_id = :mid", values={"mid": maison_id}
        )
        evenement_ids = [r["id"] for r in evenement_id_rows]
        if evenement_ids:
            await database.execute(
                evenement_reponses.delete().where(evenement_reponses.c.evenement_id.in_(evenement_ids))
            )
        await database.execute(evenements.delete().where(evenements.c.maison_id == maison_id))

        # --- Courses ---
        await database.execute(courses_items.delete().where(courses_items.c.maison_id == maison_id))

        # --- Dépenses ---
        depense_id_rows = await database.fetch_all(
            "SELECT id FROM depenses WHERE maison_id = :mid", values={"mid": maison_id}
        )
        depense_ids = [r["id"] for r in depense_id_rows]
        if depense_ids:
            await database.execute(depense_parts.delete().where(depense_parts.c.depense_id.in_(depense_ids)))
        await database.execute(depenses.delete().where(depenses.c.maison_id == maison_id))

        # --- Menu ---
        await database.execute(repas_table.delete().where(repas_table.c.maison_id == maison_id))

        # --- Chat ---
        await database.execute(messages.delete().where(messages.c.maison_id == maison_id))

        # --- Boutique ---
        await database.execute(recompense_echanges.delete().where(recompense_echanges.c.maison_id == maison_id))
        await database.execute(boutique_recompenses.delete().where(boutique_recompenses.c.maison_id == maison_id))

        # --- Défis ---
        defi_id_rows = await database.fetch_all(
            "SELECT id FROM defis WHERE maison_id = :mid", values={"mid": maison_id}
        )
        defi_ids = [r["id"] for r in defi_id_rows]
        if defi_ids:
            await database.execute(defi_participants.delete().where(defi_participants.c.defi_id.in_(defi_ids)))
        await database.execute(defis.delete().where(defis.c.maison_id == maison_id))

        # --- Points log ---
        await database.execute(points_log.delete().where(points_log.c.maison_id == maison_id))

        await database.execute(membres_maison.delete().where(membres_maison.c.maison_id == maison_id))
        await database.execute(maisons.delete().where(maisons.c.id == maison_id))

    return {"message": "Maison supprimée"}


@router.post("/maisons/join")
@limiter.limit("10/minute")
async def join_maison(
    request: Request, data: MaisonJoinInput, current_user: dict = Depends(get_current_user)
):
    """Rejoint une maison via son code d'invitation. 404 si code inconnu, 200 si déjà membre."""
    code = data.code_invitation.strip().upper()
    maison = await database.fetch_one(maisons.select().where(maisons.c.code_invitation == code))
    if not maison:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code d'invitation inconnu")

    role = await get_role_in_maison(maison["id"], current_user["id"])
    if role is not None:
        result = dict(maison)
        result["role"] = role
        return result

    await database.execute(
        membres_maison.insert().values(
            maison_id=maison["id"], utilisateur_id=current_user["id"], role="membre"
        )
    )
    # ANNEXE V4 — rappel des règles à quiconque rejoint la maison.
    await rappeler_regles(maison["id"], current_user["id"])

    # ANNEXE V8 — le foyer apprend l'arrivée. `exclure` évite d'annoncer à
    # l'arrivant qu'il vient d'arriver.
    await notifier_maison(
        maison["id"],
        type="maison",
        titre="👋 Nouveau membre",
        message=f"{current_user['nom']} a rejoint {maison['nom']}",
        lien=f"maison:{maison['id']}",
        exclure=current_user["id"],
    )

    result = dict(maison)
    result["role"] = "membre"
    return result


@router.get("/maisons/{maison_id}/membres")
async def list_membres(maison_id: int, current_user: dict = Depends(get_current_user)):
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        MEMBRE_FIELDS_SQL
        + """
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid
        ORDER BY mm.date_ajout ASC
        """,
        values={"mid": maison_id},
    )
    return [_serialize_membre(r) for r in rows]


@router.get("/maisons/{maison_id}/anniversaires")
async def anniversaires(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Anniversaires des membres, triés par prochaine occurrence.
    Chaque entrée : membre + jours restants, âge à venir, et s'il a lieu aujourd'hui.
    """
    await require_membre(maison_id, current_user["id"])
    rows = await database.fetch_all(
        """
        SELECT u.id, u.nom, u.image, u.date_naissance
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid AND u.date_naissance IS NOT NULL
        """,
        values={"mid": maison_id},
    )

    today = date.today()
    result = []
    for r in rows:
        dn = r["date_naissance"]
        try:
            naissance = dn if isinstance(dn, date) else date.fromisoformat(str(dn)[:10])
        except (ValueError, TypeError):
            continue

        def _ce_jour(annee: int) -> date:
            try:
                return naissance.replace(year=annee)
            except ValueError:  # 29 février sur une année non bissextile
                return date(annee, naissance.month, 28)

        prochaine = _ce_jour(today.year)
        if prochaine < today:
            prochaine = _ce_jour(today.year + 1)
        jours_restants = (prochaine - today).days
        age_a_venir = prochaine.year - naissance.year

        result.append(
            {
                "id": r["id"],
                "nom": r["nom"],
                "image": r["image"],
                "date_naissance": str(naissance),
                "prochaine_date": str(prochaine),
                "jours_restants": jours_restants,
                "age_a_venir": age_a_venir,
                "aujourdhui": jours_restants == 0,
            }
        )

    result.sort(key=lambda x: x["jours_restants"])
    return result


@router.post("/maisons/{maison_id}/membres", status_code=status.HTTP_201_CREATED)
async def add_membre(
    maison_id: int, data: MembreAddInput, current_user: dict = Depends(get_current_user)
):
    """Ajoute un membre (gestion : chef ou co-chef). 400 si déjà membre."""
    await require_gestion(maison_id, current_user["id"])

    user = await database.fetch_one(
        utilisateurs.select().where(utilisateurs.c.id == data.utilisateur_id)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")

    existing_role = await get_role_in_maison(maison_id, data.utilisateur_id)
    if existing_role is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cet utilisateur est déjà membre de la maison"
        )

    await database.execute(
        membres_maison.insert().values(
            maison_id=maison_id, utilisateur_id=data.utilisateur_id, role="membre"
        )
    )
    # ANNEXE V4 — rappel des règles à quiconque est ajouté à la maison.
    await rappeler_regles(maison_id, data.utilisateur_id)

    # ANNEXE V8 — même événement que /maisons/join, par l'autre porte : ici
    # quelqu'un ajoute un tiers. Deux exclusions différentes, donc `notifier`
    # plutôt que `notifier_maison` : l'auteur (via `exclure`) et le nouvel
    # arrivant lui-même (via le filtre), à qui « X a rejoint le foyer » quand X
    # c'est lui n'apprendrait rien.
    autres = [i for i in await membres_ids(maison_id) if i != data.utilisateur_id]
    await notifier(
        autres,
        type="maison",
        titre="👋 Nouveau membre",
        message=f"{user['nom']} a rejoint le foyer",
        maison_id=maison_id,
        lien=f"maison:{maison_id}",
        exclure=current_user["id"],
    )

    return public_user(user)


@router.delete("/maisons/{maison_id}/membres/{uid}")
async def remove_membre(maison_id: int, uid: int, current_user: dict = Depends(get_current_user)):
    """Retire un membre.
    - La gestion (chef/co-chef) peut retirer n'importe quel membre (sauf le chef).
    - Un membre peut se retirer lui-même (quitter la maison).
    Le chef ne peut pas quitter la maison : il doit la supprimer ou transférer son rôle.
    """
    maison = await get_maison_or_404(maison_id)
    is_self = uid == current_user["id"]

    if is_self:
        # Quitter la maison : il faut au moins être membre.
        await require_membre(maison_id, current_user["id"])
    else:
        # Retirer quelqu'un d'autre : réservé à la gestion (chef/co-chef).
        await require_gestion(maison_id, current_user["id"])

    if maison["chef_id"] == uid:
        detail = (
            "Le chef ne peut pas quitter la maison : supprimez-la ou transférez le rôle de chef"
            if is_self
            else "Impossible de retirer le chef de la maison"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    role = await get_role_in_maison(maison_id, uid)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Cet utilisateur n'est pas membre de la maison"
        )

    # Retrait atomique + nettoyage des données de participation du membre dans
    # CETTE maison (sinon assignations, bulletins, participations, validations
    # pointeraient vers un non-membre et fausseraient classements/jointures).
    # On conserve volontairement l'historique partagé : dépenses et chat
    # (l'utilisateur existe toujours en tant que compte, seule l'appartenance
    # à la maison est supprimée).
    async with database.transaction():
        for table in ("activite_assignations", "activite_participants"):
            await database.execute(
                f"DELETE FROM {table} WHERE utilisateur_id = :uid AND activite_id IN "
                "(SELECT id FROM activites WHERE maison_id = :mid)",
                values={"uid": uid, "mid": maison_id},
            )
        await database.execute(
            "DELETE FROM vote_bulletins WHERE utilisateur_id = :uid AND vote_id IN "
            "(SELECT id FROM votes WHERE maison_id = :mid)",
            values={"uid": uid, "mid": maison_id},
        )
        await database.execute(
            "DELETE FROM defi_participants WHERE utilisateur_id = :uid AND defi_id IN "
            "(SELECT id FROM defis WHERE maison_id = :mid)",
            values={"uid": uid, "mid": maison_id},
        )
        await database.execute(
            "DELETE FROM tache_validations WHERE utilisateur_id = :uid AND tache_id IN "
            "(SELECT id FROM taches WHERE maison_id = :mid)",
            values={"uid": uid, "mid": maison_id},
        )
        await database.execute(
            "DELETE FROM evenement_reponses WHERE utilisateur_id = :uid AND evenement_id IN "
            "(SELECT id FROM evenements WHERE maison_id = :mid)",
            values={"uid": uid, "mid": maison_id},
        )
        await database.execute(
            membres_maison.delete().where(
                (membres_maison.c.maison_id == maison_id) & (membres_maison.c.utilisateur_id == uid)
            )
        )
    return {"message": "Membre retiré"}


# ==================== ANNEXE V3/V4 — Rôles & transfert de chef ====================

@router.post("/maisons/{maison_id}/membres/{uid}/role")
async def set_role(
    maison_id: int, uid: int, data: RoleUpdateInput, current_user: dict = Depends(get_current_user)
):
    """Change le rôle (co_chef|chef_temporaire|membre|visiteur), le lien familial
    et/ou le profil enfant d'un membre (chef uniquement). Le passage au rôle
    'chef' se fait exclusivement via /transferer-chef (ANNEXE V4)."""
    await require_chef(maison_id, current_user["id"])

    if data.role is not None and data.role not in VALID_ROLES_SET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rôle invalide (attendu: 'co_chef', 'chef_temporaire', 'membre' ou 'visiteur' "
            "— utilisez /transferer-chef pour le chef)",
        )
    if data.lien_famille is not None and data.lien_famille not in VALID_LIENS_FAMILLE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien familial invalide")

    maison = await get_maison_or_404(maison_id)
    if maison["chef_id"] == uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de changer le rôle du chef : transférez d'abord le rôle de chef",
        )

    role = await get_role_in_maison(maison_id, uid)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cet utilisateur n'est pas membre de la maison")

    values = {}
    if data.role is not None:
        values["role"] = data.role
        # Les champs d'expiration ne concernent que le rôle correspondant.
        # naive_utc : colonnes TIMESTAMP naïves, le client peut envoyer de l'UTC
        # aware (« Z ») — asyncpg refuserait un datetime aware ou une chaîne.
        if data.role == "chef_temporaire":
            values["role_expire_le"] = naive_utc(data.expire_le)
            values["visite_expire_le"] = None
        elif data.role == "visiteur":
            values["visite_expire_le"] = naive_utc(data.expire_le)
            values["role_expire_le"] = None
        else:
            values["role_expire_le"] = None
            values["visite_expire_le"] = None
    if data.lien_famille is not None:
        values["lien_famille"] = data.lien_famille
    if data.est_enfant is not None:
        values["est_enfant"] = bool(data.est_enfant)

    if values:
        await database.execute(
            membres_maison.update()
            .where((membres_maison.c.maison_id == maison_id) & (membres_maison.c.utilisateur_id == uid))
            .values(**values)
        )

    # Passage au rôle visiteur : rappel des règles.
    if data.role == "visiteur":
        await rappeler_regles(maison_id, uid)

    # ANNEXE V8 — l'intéressé (et lui seul) est prévenu : c'est SON pouvoir dans
    # le foyer qui change. On ne notifie que sur un vrai changement de rôle, pas
    # sur une retouche de lien familial ou du profil enfant.
    if data.role is not None and data.role != role:
        await notifier(
            [uid],
            type="maison",
            titre="🔑 Ton rôle a changé",
            message=f"Tu es maintenant {ROLE_LABELS.get(data.role, data.role)} de {maison['nom']}",
            maison_id=maison_id,
            lien=f"maison:{maison_id}",
            exclure=current_user["id"],
        )

    updated = await database.fetch_one(
        MEMBRE_FIELDS_SQL
        + """
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid AND mm.utilisateur_id = :uid
        """,
        values={"mid": maison_id, "uid": uid},
    )
    return _serialize_membre(updated)


@router.post("/maisons/{maison_id}/chef-temporaire")
async def set_chef_temporaire(
    maison_id: int, data: ChefTemporaireInput, current_user: dict = Depends(get_current_user)
):
    """Désigne un chef temporaire (chef uniquement) — role='chef_temporaire' + role_expire_le."""
    await require_chef(maison_id, current_user["id"])
    maison = await get_maison_or_404(maison_id)

    if maison["chef_id"] == data.utilisateur_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cet utilisateur est déjà chef")

    role = await get_role_in_maison(maison_id, data.utilisateur_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cet utilisateur n'est pas membre de la maison")

    await database.execute(
        membres_maison.update()
        .where(
            (membres_maison.c.maison_id == maison_id)
            & (membres_maison.c.utilisateur_id == data.utilisateur_id)
        )
        .values(role="chef_temporaire", role_expire_le=naive_utc(data.expire_le), visite_expire_le=None)
    )

    # ANNEXE V8 — changement de rôle par l'autre porte : on prévient l'intéressé,
    # qui hérite de responsabilités sans forcément l'avoir demandé.
    await notifier(
        [data.utilisateur_id],
        type="maison",
        titre="🔑 Ton rôle a changé",
        message=f"Tu es maintenant chef temporaire de {maison['nom']}",
        maison_id=maison_id,
        lien=f"maison:{maison_id}",
        exclure=current_user["id"],
    )

    updated = await database.fetch_one(
        MEMBRE_FIELDS_SQL
        + """
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid AND mm.utilisateur_id = :uid
        """,
        values={"mid": maison_id, "uid": data.utilisateur_id},
    )
    return _serialize_membre(updated)


@router.post("/maisons/{maison_id}/visiteurs")
async def set_visiteur(
    maison_id: int, data: VisiteurInput, current_user: dict = Depends(get_current_user)
):
    """Marque un utilisateur comme visiteur temporaire (gestion) — l'ajoute comme
    membre si nécessaire, remet `regles_vues_le=NULL` et notifie le rappel des règles."""
    await require_gestion(maison_id, current_user["id"])

    user = await database.fetch_one(utilisateurs.select().where(utilisateurs.c.id == data.utilisateur_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")

    role = await get_role_in_maison(maison_id, data.utilisateur_id)
    if role is None:
        await database.execute(
            membres_maison.insert().values(
                maison_id=maison_id,
                utilisateur_id=data.utilisateur_id,
                role="visiteur",
                visite_expire_le=naive_utc(data.expire_le),
            )
        )
    else:
        maison = await get_maison_or_404(maison_id)
        if maison["chef_id"] == data.utilisateur_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le chef ne peut pas être visiteur")
        await database.execute(
            membres_maison.update()
            .where(
                (membres_maison.c.maison_id == maison_id)
                & (membres_maison.c.utilisateur_id == data.utilisateur_id)
            )
            .values(role="visiteur", visite_expire_le=naive_utc(data.expire_le), role_expire_le=None)
        )

    # Rappel des règles (regles_vues_le=NULL + notification).
    await rappeler_regles(maison_id, data.utilisateur_id)

    updated = await database.fetch_one(
        MEMBRE_FIELDS_SQL
        + """
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid AND mm.utilisateur_id = :uid
        """,
        values={"mid": maison_id, "uid": data.utilisateur_id},
    )
    return _serialize_membre(updated)


@router.post("/maisons/{maison_id}/transferer-chef")
async def transferer_chef(
    maison_id: int, data: TransfererChefInput, current_user: dict = Depends(get_current_user)
):
    """Transfère le rôle de chef à un autre membre. L'ancien chef devient membre (chef uniquement)."""
    await require_chef(maison_id, current_user["id"])
    maison = await get_maison_or_404(maison_id)

    if data.utilisateur_id == current_user["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vous êtes déjà chef de cette maison")

    role = await get_role_in_maison(maison_id, data.utilisateur_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cet utilisateur n'est pas membre de la maison")

    # Les trois écritures (nouveau chef sur la maison, promotion du membre,
    # rétrogradation de l'ancien chef) sont atomiques : plus de risque de
    # laisser la maison avec deux chefs ou aucun en cas d'interruption.
    async with database.transaction():
        await database.execute(
            maisons.update().where(maisons.c.id == maison_id).values(chef_id=data.utilisateur_id)
        )
        await database.execute(
            membres_maison.update()
            .where((membres_maison.c.maison_id == maison_id) & (membres_maison.c.utilisateur_id == data.utilisateur_id))
            .values(role="chef", est_enfant=False)
        )
        await database.execute(
            membres_maison.update()
            .where((membres_maison.c.maison_id == maison_id) & (membres_maison.c.utilisateur_id == current_user["id"]))
            .values(role="membre")
        )

    # ANNEXE V8 — TOUT le foyer est prévenu : savoir qui décide n'est pas une
    # affaire privée entre l'ancien et le nouveau chef. Notifié hors transaction
    # (une notification qui échoue ne doit pas annuler le transfert).
    nouveau = await database.fetch_one(
        "SELECT nom FROM utilisateurs WHERE id = :uid", values={"uid": data.utilisateur_id}
    )
    await notifier_maison(
        maison_id,
        type="maison",
        titre="👑 Nouveau chef",
        message=f"{nouveau['nom'] if nouveau else 'Un membre'} est désormais chef de {maison['nom']}",
        lien=f"maison:{maison_id}",
        exclure=current_user["id"],
    )

    updated = await database.fetch_one(maisons.select().where(maisons.c.id == maison_id))
    result = dict(updated)
    result["role"] = "membre"
    return result


# ==================== ANNEXE V3 — Points, classement & badges ====================

@router.get("/maisons/{maison_id}/classement")
async def classement(
    maison_id: int, periode: str = Query("total"), current_user: dict = Depends(get_current_user)
):
    """Classement des membres. `periode` = semaine|mois|total.
    `total` = score cumulé (membres_maison.points) ; sinon somme de points_log sur la période."""
    await require_membre(maison_id, current_user["id"])
    if periode not in ("semaine", "mois", "total"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Période invalide")

    if periode == "total":
        rows = await database.fetch_all(
            """
            SELECT u.id AS utilisateur_id, u.nom, u.image, mm.points AS points
            FROM membres_maison mm
            JOIN utilisateurs u ON u.id = mm.utilisateur_id
            WHERE mm.maison_id = :mid
            ORDER BY mm.points DESC
            """,
            values={"mid": maison_id},
        )
        return [dict(r) for r in rows]

    since = datetime.utcnow() - (timedelta(days=7) if periode == "semaine" else timedelta(days=30))
    rows = await database.fetch_all(
        """
        SELECT u.id AS utilisateur_id, u.nom, u.image,
               COALESCE((
                   SELECT SUM(pl.delta) FROM points_log pl
                   WHERE pl.utilisateur_id = u.id AND pl.maison_id = mm.maison_id AND pl.date_creation >= :since
               ), 0) AS points
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid
        ORDER BY points DESC
        """,
        values={"mid": maison_id, "since": since},
    )
    return [dict(r) for r in rows]


@router.get("/maisons/{maison_id}/badges")
async def badges(maison_id: int, current_user: dict = Depends(get_current_user)):
    """Badges dérivés des stats de chaque membre (calculés à la lecture)."""
    await require_membre(maison_id, current_user["id"])

    membres = await database.fetch_all(
        """
        SELECT u.id, u.nom, u.image, mm.points
        FROM membres_maison mm
        JOIN utilisateurs u ON u.id = mm.utilisateur_id
        WHERE mm.maison_id = :mid
        """,
        values={"mid": maison_id},
    )

    since_month = datetime.utcnow() - timedelta(days=30)
    month_rows = await database.fetch_all(
        """
        SELECT utilisateur_id, COALESCE(SUM(delta), 0) AS points
        FROM points_log
        WHERE maison_id = :mid AND date_creation >= :since
        GROUP BY utilisateur_id
        ORDER BY points DESC
        LIMIT 1
        """,
        values={"mid": maison_id, "since": since_month},
    )
    top_month_id = month_rows[0]["utilisateur_id"] if month_rows and month_rows[0]["points"] > 0 else None

    result = []
    for m in membres:
        uid = m["id"]
        nb_termine_row = await database.fetch_one(
            """
            SELECT COUNT(*) AS n FROM activites a
            JOIN activite_assignations aa ON aa.activite_id = a.id
            WHERE a.maison_id = :mid AND aa.utilisateur_id = :uid AND a.statut = 'termine'
            """,
            values={"mid": maison_id, "uid": uid},
        )
        nb_termine = nb_termine_row["n"] if nb_termine_row else 0

        member_badges = []
        if nb_termine >= 1:
            member_badges.append(
                {"code": "premiere_activite", "titre": "🌟 Première activité", "description": "A terminé sa première activité"}
            )
        if nb_termine >= 10:
            member_badges.append(
                {"code": "10_activites", "titre": "🧹 10 activités terminées", "description": "A terminé 10 activités"}
            )
        if nb_termine >= 50:
            member_badges.append(
                {"code": "50_activites", "titre": "🔥 50 activités terminées", "description": "A terminé 50 activités"}
            )
        if (m["points"] or 0) >= 100:
            member_badges.append(
                {"code": "100_points", "titre": "💯 100 points", "description": "A cumulé 100 points"}
            )
        if top_month_id == uid:
            member_badges.append(
                {"code": "premier_du_mois", "titre": "🏆 1er du mois", "description": "Meilleur score du mois"}
            )

        result.append(
            {
                "utilisateur_id": uid,
                "nom": m["nom"],
                "image": m["image"],
                "points": m["points"],
                "badges": member_badges,
            }
        )
    return result
