from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Email Tick Tracker"
    database_url: str = "sqlite:///./tracker.db"
    secret_key: str = "change-me-in-production"
    api_key: str = "change-me-api-key"

    # Optional: base URL of the tracking server, used to build pixel URLs.
    base_url: str = "http://localhost:8000"

    # Dedup window in seconds for open events.
    open_dedup_window: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
