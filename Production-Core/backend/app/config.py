from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "Kiddoo AI"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"                      # "production" disables every dev shortcut

    # Supabase Postgres (free tier). Use the *pooler* connection string.
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    # Firebase Auth (authentication only): when set, Firebase ID tokens from this project are what the API accepts
    FIREBASE_PROJECT_ID: str = ""
    SUPABASE_JWT_SECRET: str = ""                 # only for legacy HS256 projects; new projects use JWKS
    REDIS_URL: str = "redis://localhost:6379/0"

    GROQ_API_KEY: str = ""
    GROQ_API_KEYS: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEYS: str = ""
    MISTRAL_API_KEY: str = ""
    MISTRAL_API_KEYS: str = ""
    LLM_PROVIDERS: str = "mistral,gemini,groq"            # failover order; providers without keys are skipped

    JUDGE0_API_KEY: Optional[str] = None
    JUDGE0_API_URL: str = "https://ce.judge0.com"      # free public instance; or self-host Judge0

    # --- auth (Firebase ID tokens, or legacy Supabase JWTs, are verified server-side) ---
    AUTH_DISABLED: bool = False                   # honoured ONLY when ENV != production
    ADMIN_EMAILS: str = ""                        # comma separated; verified emails here open the admin console
    ADMIN_MIN_GROUP: int = 5                      # admin console hides any group smaller than this (production only)
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- RAG ---
    RAG_DB_PATH: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                                    "data", "rag.sqlite")
    RAG_NEURAL: bool = True                       # bge embeddings + cross-encoder (free, local)
    RAG_RATE_LIMIT_PER_MIN: int = 20

    @property
    def groq_keys_list(self) -> list[str]:
        if self.GROQ_API_KEYS:
            return [k.strip() for k in self.GROQ_API_KEYS.split(",") if k.strip()]
        return [self.GROQ_API_KEY] if self.GROQ_API_KEY else []

    @property
    def mistral_keys_list(self) -> list[str]:
        if self.MISTRAL_API_KEYS:
            return [k.strip() for k in self.MISTRAL_API_KEYS.split(",") if k.strip()]
        return [self.MISTRAL_API_KEY] if self.MISTRAL_API_KEY else []

    @property
    def gemini_keys_list(self) -> list[str]:
        if self.GEMINI_API_KEYS:
            return [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]
        return [self.GEMINI_API_KEY] if self.GEMINI_API_KEY else []

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def verify_secret(self) -> str:
        """Server-only key for coding-profile verification codes (derived from a secret that never leaves the server)."""
        import hashlib
        return hashlib.sha256(f"kiddoo-verify:{self.DATABASE_URL or self.FIREBASE_PROJECT_ID or 'dev'}".encode()).hexdigest()

    @property
    def admin_min_group(self) -> int:
        """Smallest learner group the admin console will show; 1 outside production so a local demo has numbers."""
        return max(1, self.ADMIN_MIN_GROUP) if self.is_production else 1

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        extra="ignore"
    )


settings = Settings()
