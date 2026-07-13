import logging
import warnings
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings

# Supprimer uniquement les warnings superflus émis par bcrypt (et pas tous les
# UserWarning du process, qui pourraient masquer des alertes utiles).
warnings.filterwarnings("ignore", category=UserWarning, module="bcrypt")
warnings.filterwarnings("ignore", category=UserWarning, module="passlib")

logger = logging.getLogger(__name__)

# Source unique de vérité : tout vient de settings (app/config.py).
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
TOKEN_EXPIRE_DAYS = settings.TOKEN_EXPIRE_DAYS

# Pas de Redis requis (mode dégradé permanent) : les tokens JWT suffisent,
# la session est entièrement portée par le JWT (expiration TOKEN_EXPIRE_DAYS).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt."""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe avec bcrypt."""
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    try:
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token JWT (HS256), sujet = str(user_id), expire par défaut sous 7 jours."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token_payload(token: str) -> dict:
    """Décode et valide un token JWT, renvoie le payload complet (sub, tv, exp…)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalide - utilisateur non trouvé",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError as e:
        logger.info("Erreur JWT: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_access_token(token: str) -> str:
    """Décode et valide un token JWT, renvoie l'id utilisateur (sub)."""
    return decode_access_token_payload(token)["sub"]


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """Dependency FastAPI simple : décode le JWT, renvoie l'id utilisateur (str).

    Utilisée uniquement en interne — les routes utilisent
    `app.dependencies.get_current_user`, qui charge l'utilisateur complet.
    """
    return decode_access_token(token)
