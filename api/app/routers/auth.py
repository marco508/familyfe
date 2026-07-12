# app/routers/auth.py
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database.database import database, utilisateurs
from app.dependencies import get_current_user
from app.models.schemas import PushTokenInput, SignupInput, Token, UpdateMeInput
from app.services.uploads import save_upload
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(data: SignupInput):
    """Crée un utilisateur. 400 si email/téléphone déjà pris ou mot de passe < 6 caractères."""
    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mot de passe doit contenir au moins 6 caractères",
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
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login : `username` accepte email OU nom OU téléphone."""
    query = utilisateurs.select().where(
        (utilisateurs.c.email == form_data.username)
        | (utilisateurs.c.nom == form_data.username)
        | (utilisateurs.c.telephone == form_data.username)
    )
    user = await database.fetch_one(query)

    if not user or not verify_password(form_data.password, user["mot_de_passe_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiant ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user["id"])})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Pas de session serveur à invalider (mode dégradé JWT-only) : no-op côté API,
    le client doit simplement supprimer le token stocké."""
    return {"message": "Déconnexion réussie"}


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
