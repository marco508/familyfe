# app/dependencies.py
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.database.database import database, maisons, membres_maison
from app.utils.security import decode_access_token_payload

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Récupère l'utilisateur actuel à partir du token JWT.

    Lève une HTTPException 401 si le token est invalide/expiré ou si
    l'utilisateur n'existe plus en base.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token_payload(token)
    user_id = payload.get("sub")

    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        logger.warning("Format d'ID utilisateur invalide: %s", user_id)
        raise credentials_exception

    query = """
        SELECT id, nom, email, telephone, image, date_naissance, date_creation, token_version
        FROM utilisateurs WHERE id = :uid
    """
    user = await database.fetch_one(query, values={"uid": uid})

    if user is None:
        logger.info("Utilisateur introuvable pour l'ID: %s", uid)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Révocation : un token dont la version ne correspond plus à celle du compte
    # (déconnexion globale) est rejeté, même s'il n'est pas encore expiré.
    if int(payload.get("tv", 0)) != int(user["token_version"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expirée, veuillez vous reconnecter",
            headers={"WWW-Authenticate": "Bearer"},
        )

    data = dict(user)
    data.pop("token_version", None)  # champ interne, pas exposé
    return data


# ==================== Autorisation maison ====================

async def get_maison_or_404(maison_id: int) -> dict:
    maison = await database.fetch_one(maisons.select().where(maisons.c.id == maison_id))
    if not maison:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maison introuvable")
    return dict(maison)


async def get_role_in_maison(maison_id: int, user_id: int) -> Optional[str]:
    row = await database.fetch_one(
        membres_maison.select().where(
            (membres_maison.c.maison_id == maison_id)
            & (membres_maison.c.utilisateur_id == user_id)
        )
    )
    return row["role"] if row else None


async def require_membre(maison_id: int, user_id: int) -> str:
    """Vérifie que l'utilisateur est membre de la maison, renvoie son rôle. 403 sinon."""
    role = await get_role_in_maison(maison_id, user_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas membre de cette maison",
        )
    return role


async def require_chef(maison_id: int, user_id: int) -> str:
    """Vérifie que l'utilisateur est chef de la maison. 403 sinon."""
    role = await require_membre(maison_id, user_id)
    if role != "chef":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée au chef de la maison",
        )
    return role


# ==================== ANNEXE V3 — gestion (chef/co-chef) & profils enfant ====================

async def get_membre_row(maison_id: int, user_id: int) -> Optional[dict]:
    """Renvoie la ligne membres_maison (role, points, est_enfant, ...) ou None."""
    row = await database.fetch_one(
        membres_maison.select().where(
            (membres_maison.c.maison_id == maison_id)
            & (membres_maison.c.utilisateur_id == user_id)
        )
    )
    return dict(row) if row else None


async def require_membre_row(maison_id: int, user_id: int) -> dict:
    """Comme `require_membre` mais renvoie la ligne complète (role, est_enfant...)."""
    row = await get_membre_row(maison_id, user_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas membre de cette maison",
        )
    return row


async def require_gestion(maison_id: int, user_id: int) -> str:
    """Vérifie que l'utilisateur peut gérer la maison (chef, co-chef OU
    chef_temporaire — jamais un profil enfant ni un visiteur). 403 sinon.
    Renvoie le rôle. (ANNEXE V4 : ajoute chef_temporaire à la gestion.)"""
    row = await require_membre_row(maison_id, user_id)
    if row["role"] not in ("chef", "co_chef", "chef_temporaire"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée au chef, au co-chef ou au chef temporaire de la maison",
        )
    if row.get("est_enfant"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action non autorisée pour un compte enfant",
        )
    return row["role"]


async def require_gestion_ou_createur(
    maison_id: int, user_id: int, createur_id: Optional[int]
) -> str:
    """Autorise l'action si l'utilisateur est le créateur de la ressource OU
    peut gérer la maison (chef / co-chef / chef_temporaire, jamais un enfant).

    Centralise le pattern « gestionnaire OU créateur » qui était recopié dans
    activites/votes/defis/evenements avec des ensembles de rôles divergents
    (certains oubliaient chef_temporaire). 403 sinon. Renvoie le rôle.
    """
    row = await require_membre_row(maison_id, user_id)
    if createur_id is not None and user_id == createur_id:
        return row["role"]
    if row["role"] not in ("chef", "co_chef", "chef_temporaire") or row.get("est_enfant"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée au créateur ou à un responsable de la maison",
        )
    return row["role"]


async def require_not_enfant(
    maison_id: int,
    user_id: int,
    detail: str = "Action non autorisée pour un compte enfant",
) -> dict:
    """Vérifie que l'utilisateur (membre de la maison) n'est pas un profil enfant.
    403 avec un message clair sinon. Renvoie la ligne membres_maison."""
    row = await require_membre_row(maison_id, user_id)
    if row.get("est_enfant"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    return row


# ==================== ANNEXE V4 — Visiteurs (lecture seule) ====================

async def require_not_visiteur(
    maison_id: int,
    user_id: int,
    detail: str = "Action non autorisée pour un visiteur (lecture seule)",
) -> dict:
    """Vérifie que l'utilisateur (membre de la maison) n'a pas le rôle 'visiteur'
    (lecture seule). 403 avec un message clair sinon. Renvoie la ligne membres_maison."""
    row = await require_membre_row(maison_id, user_id)
    if row.get("role") == "visiteur":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    return row
