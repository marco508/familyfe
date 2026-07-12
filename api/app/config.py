# app/config.py
from typing import List

from pydantic_settings import BaseSettings


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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
