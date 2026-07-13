# app/routers/auth.py
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database.database import database, utilisateurs
from app.dependencies import get_current_user
from app.models.schemas import PushTokenInput, SignupInput, Token, UpdateMeInput
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


@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user


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
        SELECT id, nom, email, telephone, image, date_naissance, date_creation
        FROM utilisateurs WHERE id = :uid
        """,
        values={"uid": current_user["id"]},
    )
    return dict(updated)


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


@router.post("/me/push-token")
async def set_push_token(data: PushTokenInput, current_user: dict = Depends(get_current_user)):
    """Enregistre le jeton Expo push de l'appelant (best-effort, dev build uniquement)."""
    await database.execute(
        utilisateurs.update().where(utilisateurs.c.id == current_user["id"]).values(push_token=data.token)
    )
    return {"message": "Token enregistré"}
