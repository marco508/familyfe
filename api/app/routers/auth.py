# app/routers/auth.py
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database.database import database, utilisateurs
from app.dependencies import get_current_user
from app.models.schemas import (
    DeleteAccountInput,
    NotificationsPrefsInput,
    PushTokenInput,
    SignupInput,
    Token,
    UpdateMeInput,
)
from app.services.notifications import CATEGORIES, parse_categories, serialize_categories
from app.services.uploads import save_upload
from app.utils.ratelimit import limiter
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])

# Hash bcrypt factice : comparé quand l'utilisateur n'existe pas, pour que le
# temps de réponse du login soit constant (évite l'énumération par timing).
_DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO3Q0Z1nO9bqE0Xh0aQ0z0qGqg8Zs5Qy"

# Longueur minimale de mot de passe (relevée de 6 à 8).
_MIN_PASSWORD_LEN = 8


@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def signup(request: Request, data: SignupInput):
    """Crée un utilisateur. 400 si email/téléphone déjà pris ou mot de passe trop court."""
    if len(data.password) < _MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le mot de passe doit contenir au moins {_MIN_PASSWORD_LEN} caractères",
        )

    email = data.email.strip().lower()
    existing_email = await database.fetch_one(
        utilisateurs.select().where(utilisateurs.c.email == email)
    )
    if existing_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cet email est déjà utilisé")

    telephone = data.telephone.strip() if data.telephone else None
    if telephone:
        existing_tel = await database.fetch_one(
            utilisateurs.select().where(utilisateurs.c.telephone == telephone)
        )
        if existing_tel:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce téléphone est déjà utilisé")

    await database.execute(
        utilisateurs.insert().values(
            nom=data.nom,
            email=email,
            telephone=telephone,
            date_naissance=data.date_naissance,
            mot_de_passe_hash=hash_password(data.password),
        )
    )
    return {"message": "Compte créé avec succès"}


@router.post("/token", response_model=Token)
@limiter.limit("10/minute")
async def login_for_access_token(
    request: Request, form_data: OAuth2PasswordRequestForm = Depends()
):
    """Login : `username` accepte email OU nom OU téléphone."""
    query = utilisateurs.select().where(
        (utilisateurs.c.email == form_data.username)
        | (utilisateurs.c.nom == form_data.username)
        | (utilisateurs.c.telephone == form_data.username)
    )
    user = await database.fetch_one(query)

    # Toujours vérifier un hash (celui de l'utilisateur, ou un hash factice) pour
    # que le temps de réponse ne révèle pas si l'identifiant existe.
    hashed = user["mot_de_passe_hash"] if user else _DUMMY_HASH
    password_ok = verify_password(form_data.password, hashed)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiant ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": str(user["id"]), "tv": int(user["token_version"] or 0)}
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Déconnexion simple : le client supprime le token stocké. Le token reste
    techniquement valide jusqu'à expiration (pour tout révoquer, voir
    /me/deconnexion-globale)."""
    return {"message": "Déconnexion réussie"}


@router.post("/me/deconnexion-globale")
async def deconnexion_globale(current_user: dict = Depends(get_current_user)):
    """Invalide TOUS les tokens existants de l'utilisateur (y compris celui-ci)
    en incrémentant sa version de session. Utile en cas de vol de token ou de
    déconnexion de tous les appareils."""
    await database.execute(
        "UPDATE utilisateurs SET token_version = token_version + 1 WHERE id = :uid",
        values={"uid": current_user["id"]},
    )
    return {"message": "Toutes les sessions ont été déconnectées"}


def _serialize_me(row) -> dict:
    """Expose `notif_desactivees` en LISTE (stocké en CSV côté base), comme
    `maison.modules`. Le client lit un tableau, jamais la chaîne brute."""
    d = dict(row)
    d["notif_desactivees"] = parse_categories(d.get("notif_desactivees"))
    return d


@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return _serialize_me(current_user)


@router.put("/me")
async def update_user_profile(data: UpdateMeInput, current_user: dict = Depends(get_current_user)):
    email = data.email.strip().lower()
    if email != current_user["email"]:
        existing = await database.fetch_one(
            utilisateurs.select().where(utilisateurs.c.email == email)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cet email est déjà utilisé")

    telephone = data.telephone.strip() if data.telephone else None
    if telephone and telephone != current_user.get("telephone"):
        existing = await database.fetch_one(
            utilisateurs.select().where(utilisateurs.c.telephone == telephone)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce téléphone est déjà utilisé")

    values = {
        "nom": data.nom,
        "email": email,
        "telephone": telephone,
        "image": data.image,
    }
    # date_naissance : ne l'écrase que si fournie (évite d'effacer par omission).
    if data.date_naissance is not None:
        values["date_naissance"] = data.date_naissance

    await database.execute(
        utilisateurs.update().where(utilisateurs.c.id == current_user["id"]).values(**values)
    )

    updated = await database.fetch_one(
        """
        SELECT id, nom, email, telephone, image, date_naissance, date_creation,
               notif_desactivees
        FROM utilisateurs WHERE id = :uid
        """,
        values={"uid": current_user["id"]},
    )
    return _serialize_me(updated)


# ==================== ANNEXE V3 — Avatar & push token ====================

@router.post("/me/avatar")
async def upload_avatar(
    image: UploadFile = File(...), current_user: dict = Depends(get_current_user)
):
    """Upload de la photo de profil (multipart `image`) — sauvegardée dans
    uploads/avatars, servie en statique via /uploads."""
    url = await save_upload(image, "avatars")
    await database.execute(
        utilisateurs.update().where(utilisateurs.c.id == current_user["id"]).values(image=url)
    )
    return {"image": url}


# ==================== ANNEXE V8 — Préférences de notification ====================

@router.get("/me/notifications")
async def get_notifications_prefs(current_user: dict = Depends(get_current_user)):
    """Catégories disponibles + celles que l'appelant a désactivées.

    `categories` évite au client de coder en dur la liste (et de se désynchroniser
    du serveur quand une catégorie apparaît).
    """
    return {
        "categories": CATEGORIES,
        "desactivees": parse_categories(current_user.get("notif_desactivees")),
    }


@router.put("/me/notifications")
async def update_notifications_prefs(
    data: NotificationsPrefsInput, current_user: dict = Depends(get_current_user)
):
    """Remplace la liste des catégories désactivées.

    `[]` (tout réactiver) est un choix légitime, d'où le test sur `is not None`
    et non sur la vacuité — sans quoi « je veux tout recevoir » serait
    silencieusement ignoré.
    """
    if data.desactivees is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Champ 'desactivees' requis (liste de catégories, [] pour tout réactiver)",
        )

    inconnues = [c for c in data.desactivees if c not in CATEGORIES]
    if inconnues:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Catégorie(s) inconnue(s) : {', '.join(inconnues)}",
        )

    csv = serialize_categories(data.desactivees)
    await database.execute(
        utilisateurs.update()
        .where(utilisateurs.c.id == current_user["id"])
        .values(notif_desactivees=csv)
    )
    return {"desactivees": parse_categories(csv)}


@router.post("/me/push-token")
async def set_push_token(data: PushTokenInput, current_user: dict = Depends(get_current_user)):
    """Enregistre le jeton Expo push de l'appelant (best-effort, dev build uniquement)."""
    await database.execute(
        utilisateurs.update().where(utilisateurs.c.id == current_user["id"]).values(push_token=data.token)
    )
    return {"message": "Token enregistré"}


# ==================== SUPPRESSION DE COMPTE (RGPD) ====================
#
# Cartographie EXHAUSTIVE des FK vers utilisateurs.id (relevée dans tables.py) et
# traitement retenu pour chacune lors de la suppression d'un compte :
#
#   maisons.chef_id (NOT NULL)                 → transfert de chef (ou maison supprimée si seul membre)
#   membres_maison.utilisateur_id (NOT NULL)   → participation perso : suppression
#   activites.createur_id (NOT NULL)           → contenu PARTAGÉ : réattribué au chef cible
#   activite_assignations.utilisateur_id       → participation perso : suppression
#   activite_participants.utilisateur_id       → participation perso : suppression
#   activite_commentaires.utilisateur_id       → contenu perso : suppression
#   evenements.createur_id (NOT NULL)          → contenu PARTAGÉ : réattribué au chef cible
#   evenement_reponses.utilisateur_id          → participation perso : suppression
#   votes.createur_id (NOT NULL)               → contenu PARTAGÉ : réattribué au chef cible
#   vote_bulletins.utilisateur_id              → participation perso : suppression
#   notifications.utilisateur_id (NOT NULL)    → perso : suppression
#   courses_items.ajoute_par (NOT NULL)        → contenu PARTAGÉ : réattribué au chef cible
#   courses_items.achete_par (NULLABLE)        → référence perso : passée à NULL
#   depenses.paye_par (NOT NULL)               → contenu PARTAGÉ : réattribué au chef cible
#   depense_parts.utilisateur_id (NOT NULL)    → participation perso : suppression
#   messages.utilisateur_id (NOT NULL)         → contenu perso : suppression
#   recompense_echanges.utilisateur_id         → participation perso : suppression
#   points_log.utilisateur_id (NOT NULL)       → perso : suppression
#   defis.createur_id (NOT NULL)               → contenu PARTAGÉ : réattribué au chef cible
#   defi_participants.utilisateur_id           → participation perso : suppression
#   pieces.affecte_a (NULLABLE)                → référence perso : passée à NULL
#   regles.createur_id (NOT NULL)              → contenu PARTAGÉ : réattribué au chef cible
#   taches.createur_id (NOT NULL)              → contenu PARTAGÉ : réattribué au chef cible
#   taches.assigne_id (NULLABLE)               → référence perso : passée à NULL
#   tache_validations.utilisateur_id (NOT NULL)→ participation perso : suppression
#
# Tables SANS FK vers utilisateurs (rien à faire ici) : maisons(hors chef_id),
# vote_options, repas, boutique_recompenses, activite_sous_taches, tache_pieces.


# Tables où l'utilisateur apparaît via une colonne `utilisateur_id` et dont la
# ligne est PERSONNELLE (participation/contenu propre) → suppression pure.
# Toutes ces tables ont bien une colonne `utilisateur_id` (vérifié dans tables.py).
_PERSONAL_ROW_TABLES = (
    # Enfants (référencent une ligne parente + l'utilisateur) — supprimés d'abord.
    "activite_assignations",
    "activite_participants",
    "activite_commentaires",
    "evenement_reponses",
    "vote_bulletins",
    "defi_participants",
    "recompense_echanges",
    "tache_validations",
    "depense_parts",
    "points_log",
    "notifications",
    "messages",
    # membres_maison en dernier : c'est la ligne d'appartenance de plus haut niveau.
    "membres_maison",
)

# Colonnes NON NULLABLES de contenu PARTAGÉ créé par l'utilisateur, réattribuées
# au chef cible (nouveau chef si transfert, sinon chef existant) pour ne pas
# détruire les données du foyer ni violer une FK NOT NULL.
_SHARED_CONTENT_REASSIGN = (
    ("activites", "createur_id"),
    ("evenements", "createur_id"),
    ("votes", "createur_id"),
    ("depenses", "paye_par"),
    ("defis", "createur_id"),
    ("regles", "createur_id"),
    ("taches", "createur_id"),
    ("courses_items", "ajoute_par"),
)

# Références PERSONNELLES nullable → passées à NULL (l'utilisateur part, mais la
# ligne partagée — pièce, tâche, item de courses — reste au foyer).
_PERSONAL_NULLABLE_REFS = (
    ("pieces", "affecte_a"),
    ("taches", "assigne_id"),
    ("courses_items", "achete_par"),
)


async def _delete_maison_cascade(maison_id: int) -> None:
    """Supprime une maison et TOUTES ses données rattachées.

    Ordre = enfants avant parents (respect strict des FK, y compris sur Postgres) :
      1. enfants des activités   → activités
      2. enfants des tâches      → tâches
      3. règles (FK vote_id)     → avant les votes
      4. pièces
      5. enfants des votes       → votes
      6. enfants des événements  → événements
      7. courses
      8. parts de dépenses       → dépenses
      9. repas, chat
     10. échanges boutique       → boutique
     11. participants défis      → défis
     12. points_log, notifications de la maison
     13. membres_maison          → maison

    (Miroir de DELETE /maisons/{id}, avec en plus la purge des notifications
    rattachées à la maison pour ne pas laisser de FK maison_id orpheline.)
    """
    p = {"mid": maison_id}

    # 1. Activités + enfants
    await database.execute(
        "DELETE FROM activite_assignations WHERE activite_id IN (SELECT id FROM activites WHERE maison_id = :mid)", p
    )
    await database.execute(
        "DELETE FROM activite_participants WHERE activite_id IN (SELECT id FROM activites WHERE maison_id = :mid)", p
    )
    await database.execute(
        "DELETE FROM activite_sous_taches WHERE activite_id IN (SELECT id FROM activites WHERE maison_id = :mid)", p
    )
    await database.execute(
        "DELETE FROM activite_commentaires WHERE activite_id IN (SELECT id FROM activites WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM activites WHERE maison_id = :mid", p)

    # 2. Tâches + enfants
    await database.execute(
        "DELETE FROM tache_pieces WHERE tache_id IN (SELECT id FROM taches WHERE maison_id = :mid)", p
    )
    await database.execute(
        "DELETE FROM tache_validations WHERE tache_id IN (SELECT id FROM taches WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM taches WHERE maison_id = :mid", p)

    # 3. Règles (FK vote_id) AVANT les votes ; 4. Pièces
    await database.execute("DELETE FROM regles WHERE maison_id = :mid", p)
    await database.execute("DELETE FROM pieces WHERE maison_id = :mid", p)

    # 5. Votes + enfants
    await database.execute(
        "DELETE FROM vote_bulletins WHERE vote_id IN (SELECT id FROM votes WHERE maison_id = :mid)", p
    )
    await database.execute(
        "DELETE FROM vote_options WHERE vote_id IN (SELECT id FROM votes WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM votes WHERE maison_id = :mid", p)

    # 6. Événements + enfants
    await database.execute(
        "DELETE FROM evenement_reponses WHERE evenement_id IN (SELECT id FROM evenements WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM evenements WHERE maison_id = :mid", p)

    # 7. Courses
    await database.execute("DELETE FROM courses_items WHERE maison_id = :mid", p)

    # 8. Dépenses + parts
    await database.execute(
        "DELETE FROM depense_parts WHERE depense_id IN (SELECT id FROM depenses WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM depenses WHERE maison_id = :mid", p)

    # 9. Menu + chat
    await database.execute("DELETE FROM repas WHERE maison_id = :mid", p)
    await database.execute("DELETE FROM messages WHERE maison_id = :mid", p)

    # 10. Boutique + échanges
    await database.execute("DELETE FROM recompense_echanges WHERE maison_id = :mid", p)
    await database.execute("DELETE FROM boutique_recompenses WHERE maison_id = :mid", p)

    # 11. Défis + participants
    await database.execute(
        "DELETE FROM defi_participants WHERE defi_id IN (SELECT id FROM defis WHERE maison_id = :mid)", p
    )
    await database.execute("DELETE FROM defis WHERE maison_id = :mid", p)

    # 12. Points, notifications de la maison
    await database.execute("DELETE FROM points_log WHERE maison_id = :mid", p)
    await database.execute("DELETE FROM notifications WHERE maison_id = :mid", p)

    # 13. Membres → maison
    await database.execute("DELETE FROM membres_maison WHERE maison_id = :mid", p)
    await database.execute("DELETE FROM maisons WHERE id = :mid", p)


async def _pick_successor(maison_id: int, quittant_id: int) -> int | None:
    """Choisit le successeur au poste de chef pour une maison à plusieurs membres.

    Priorité : co-chef le plus ancien → membre non-visiteur le plus ancien →
    (filet de sécurité) n'importe quel membre restant le plus ancien. Le dernier
    palier évite de laisser la maison sans chef (FK NOT NULL) dans le cas limite
    où tous les autres membres seraient des visiteurs.
    """
    params = {"mid": maison_id, "uid": quittant_id}
    for clause in (
        "AND role = 'co_chef'",
        "AND role != 'visiteur'",
        "",  # filet de sécurité : n'importe quel autre membre
    ):
        row = await database.fetch_one(
            "SELECT utilisateur_id FROM membres_maison "
            "WHERE maison_id = :mid AND utilisateur_id != :uid " + clause +
            " ORDER BY date_ajout ASC, id ASC LIMIT 1",
            params,
        )
        if row:
            return row["utilisateur_id"]
    return None


@router.post("/me/supprimer")
@limiter.limit("3/minute")
async def supprimer_mon_compte(
    request: Request, data: DeleteAccountInput, current_user: dict = Depends(get_current_user)
):
    """Supprime définitivement le compte de l'appelant (droit RGPD à l'effacement).

    - Ré-authentification obligatoire (mot de passe) : 403 sinon, rien n'est touché.
    - Pour chaque maison de l'utilisateur : suppression complète s'il est seul,
      sinon transfert du rôle de chef (si besoin) et réattribution du contenu
      partagé au chef cible, puis purge de ses lignes de participation.
    - Le tout dans UNE transaction : à la moindre erreur, aucun effacement.
    """
    uid = current_user["id"]

    # 1. Ré-authentification. On relit le hash (get_current_user ne l'expose pas).
    row = await database.fetch_one(
        "SELECT mot_de_passe_hash FROM utilisateurs WHERE id = :uid", values={"uid": uid}
    )
    if row is None:
        # Le compte a disparu entre-temps : le token est de facto invalide.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    if not verify_password(data.password, row["mot_de_passe_hash"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mot de passe incorrect")

    async with database.transaction():
        # 2. Traiter chaque maison dont l'utilisateur est membre.
        maisons_rows = await database.fetch_all(
            """
            SELECT m.id AS maison_id, m.chef_id AS chef_id
            FROM maisons m
            JOIN membres_maison mm ON mm.maison_id = m.id
            WHERE mm.utilisateur_id = :uid
            """,
            values={"uid": uid},
        )

        for mrow in maisons_rows:
            mid = mrow["maison_id"]
            nb_row = await database.fetch_one(
                "SELECT COUNT(*) AS n FROM membres_maison WHERE maison_id = :mid", values={"mid": mid}
            )
            nb_membres = nb_row["n"] if nb_row else 0

            # 2a. Seul membre → suppression complète de la maison et de ses données.
            if nb_membres <= 1:
                await _delete_maison_cascade(mid)
                continue

            # 2b. Maison à plusieurs. Déterminer le chef cible pour la réattribution.
            if mrow["chef_id"] == uid:
                # L'utilisateur est chef → transfert de la direction.
                successeur = await _pick_successor(mid, uid)
                # nb_membres > 1 garantit un successeur (au moins le filet de sécurité).
                await database.execute(
                    "UPDATE maisons SET chef_id = :sid WHERE id = :mid",
                    values={"sid": successeur, "mid": mid},
                )
                await database.execute(
                    "UPDATE membres_maison SET role = 'chef', est_enfant = :faux "
                    "WHERE maison_id = :mid AND utilisateur_id = :sid",
                    values={"faux": False, "mid": mid, "sid": successeur},
                )
                chef_cible = successeur
            else:
                # L'utilisateur n'est que membre → le contenu revient au chef en place.
                chef_cible = mrow["chef_id"]

            # 2c. Réattribuer le contenu PARTAGÉ (colonnes NOT NULL) au chef cible.
            for table, col in _SHARED_CONTENT_REASSIGN:
                await database.execute(
                    f"UPDATE {table} SET {col} = :cible WHERE maison_id = :mid AND {col} = :uid",
                    values={"cible": chef_cible, "mid": mid, "uid": uid},
                )

            # 2d. Passer à NULL les références PERSONNELLES nullable.
            for table, col in _PERSONAL_NULLABLE_REFS:
                await database.execute(
                    f"UPDATE {table} SET {col} = NULL WHERE maison_id = :mid AND {col} = :uid",
                    values={"mid": mid, "uid": uid},
                )

        # 3. Supprimer toutes les lignes de participation/contenu PERSONNEL, quel
        #    que soit le logement (celles des maisons déjà supprimées à l'étape 2a
        #    ont disparu ; il reste celles des maisons conservées).
        for table in _PERSONAL_ROW_TABLES:
            await database.execute(
                f"DELETE FROM {table} WHERE utilisateur_id = :uid", values={"uid": uid}
            )

        # 4. Supprimer enfin la ligne utilisateur.
        await database.execute("DELETE FROM utilisateurs WHERE id = :uid", values={"uid": uid})

    return {"message": "Compte supprimé"}
