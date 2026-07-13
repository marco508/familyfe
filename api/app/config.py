# app/config.py
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings

# Valeur de dev factice : autorisée seulement en environnement de développement.
_DEFAULT_SECRET = "dev-secret-change-me"


class Settings(BaseSettings):
    # --- JWT ---
    # Contrairement à yomu, une valeur de dev par défaut est fournie pour que
    # l'application démarre sans .env (confort de dev local).
    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    TOKEN_EXPIRE_DAYS: int = 7

    # --- Base de données ---
    # SQLite par défaut : aucun serveur externe requis pour démarrer en local.
    DATABASE_URL: str = "sqlite+aiosqlite:///./famylife.db"

    # --- CORS ---
    # Dev : tout autorisé par défaut (Expo Go se connecte depuis une IP LAN
    # variable, pas de domaine fixe).
    CORS_ORIGINS: str = "*"
    CORS_ORIGIN_REGEX: str = ".*"

    # --- Serveur ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = False
    ENVIRONMENT: str = "development"
    # Crée les tables au démarrage si absentes (dev uniquement).
    AUTO_CREATE_TABLES: bool = True
    # Préfixe externe quand l'API est servie derrière un reverse-proxy.
    ROOT_PATH: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        """Convertit la chaîne CORS_ORIGINS en liste."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _guard_secret_key(self) -> "Settings":
        """Refuse de démarrer hors dev avec la clé secrète par défaut.

        Sinon n'importe qui connaissant cette valeur (elle est dans le dépôt)
        pourrait forger des JWT et usurper tous les comptes.
        """
        if not self.is_development and self.SECRET_KEY == _DEFAULT_SECRET:
            raise ValueError(
                "SECRET_KEY doit être défini (variable d'environnement) en dehors "
                "du mode développement. Générez-en un avec: openssl rand -hex 32"
            )
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
