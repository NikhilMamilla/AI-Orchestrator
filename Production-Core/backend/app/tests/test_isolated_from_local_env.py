"""The suite must not depend on a developer's local backend/.env: a dead DATABASE_URL or a real API key there must not
change what the tests do, and no test may reach a real database or provider."""
from backend.app.config import settings


def test_settings_in_tests_do_not_come_from_the_local_env_file():
    assert settings.DATABASE_URL == ""
    assert settings.FIREBASE_PROJECT_ID == "" and settings.SUPABASE_URL == "" and settings.SUPABASE_JWT_SECRET == ""
    assert settings.HF_TOKEN == "" and settings.ADMIN_EMAILS == "" and settings.AUTH_DISABLED is False
    assert not (settings.mistral_keys_list or settings.gemini_keys_list or settings.groq_keys_list)
    assert settings.ENV == "development" and settings.EMBEDDINGS == "local"
