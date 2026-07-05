"""Application settings loaded from environment variables."""
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_KEYS = {"change-me", "change-me-please-very-long-random-string", "", "secret", "aethera"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    APP_NAME: str = "Aethera"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    DATABASE_URL: str = "mysql+aiomysql://root:123321@localhost:3306/aethera"

    CORS_ORIGINS: str = "http://localhost:3000"

    FACE_MATCH_THRESHOLD: float = 0.45
    FACE_MIN_QUALITY: float = 0.4
    SNAPSHOT_DIR: str = "./storage/snapshots"
    EMBEDDING_ENCRYPTION_KEY: str = "aethera-aes-key-32bytes-secret!!"
    GEOFENCE_ENABLED: bool = False
    OFFICE_LATITUDE: float | None = None
    OFFICE_LONGITUDE: float | None = None
    OFFICE_RADIUS_METERS: int = 150
    GEOFENCE_MAX_ACCURACY_METERS: int = 150

    # Web Push (VAPID) — di-generate via `python _gen_vapid.py`.
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@aethera.my.id"

    # OpenRouter (AI Insight). Gratis pakai model nemotron-3-nano-30b-a3b:free
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "nvidia/nemotron-3-nano-30b-a3b:free"
    OPENROUTER_REFERER: str = "https://aethera.my.id"
    OPENROUTER_APP_NAME: str = "Aethera"

    # ── Midtrans Payment Gateway ───────────────────────────────────────────────
    # Dapatkan key dari dashboard.midtrans.com → Settings → Access Keys.
    # Saat development pakai key Sandbox (prefix SB-Mid-...). Produksi pakai key live.
    MIDTRANS_SERVER_KEY: str = ""       # rahasia — hanya di backend
    MIDTRANS_CLIENT_KEY: str = ""       # public — dipakai frontend snap.js
    MIDTRANS_IS_PRODUCTION: bool = False  # False = sandbox, True = live
    # URL untuk redirect setelah pembayaran selesai (frontend)
    MIDTRANS_FINISH_URL: str = "https://aethera.my.id/my-bills"

    @property
    def midtrans_snap_base(self) -> str:
        return (
            "https://app.midtrans.com/snap/v1/transactions"
            if self.MIDTRANS_IS_PRODUCTION
            else "https://app.sandbox.midtrans.com/snap/v1/transactions"
        )

    @property
    def midtrans_api_base(self) -> str:
        return (
            "https://api.midtrans.com/v2"
            if self.MIDTRANS_IS_PRODUCTION
            else "https://api.sandbox.midtrans.com/v2"
        )

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_strong(cls, v: str) -> str:
        if v.lower() in _WEAK_KEYS or len(v) < 32:
            raise ValueError(
                "SECRET_KEY terlalu lemah atau masih default. "
                "Set ke random string ≥32 karakter di .env"
            )
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def snapshot_path(self) -> Path:
        p = Path(self.SNAPSHOT_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
