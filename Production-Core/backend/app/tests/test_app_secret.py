"""Server-side secrets (coding-profile codes, the keyed email hash, the research-export salt) come from a dedicated
random APP_SECRET, not from values that are public or that change when a database password is rotated."""
from backend.app.config import Settings


def make(**kw):
    return Settings(_env_file=None, **kw)


def test_verify_secret_does_not_depend_on_the_database_url_or_project_id_when_app_secret_is_set():
    a = make(APP_SECRET="s3cret-value", DATABASE_URL="postgresql://one", FIREBASE_PROJECT_ID="p1")
    b = make(APP_SECRET="s3cret-value", DATABASE_URL="postgresql://two", FIREBASE_PROJECT_ID="p2")
    assert a.verify_secret == b.verify_secret                      # rotating the DB password no longer changes every code
    assert a.verify_secret != make(APP_SECRET="another", DATABASE_URL="postgresql://one").verify_secret


def test_export_salt_is_secret_and_never_the_constant_kiddoo():
    s = make(APP_SECRET="s3cret-value", FIREBASE_PROJECT_ID="p1")
    assert s.export_salt not in ("kiddoo", "") and "s3cret" not in s.export_salt
    assert s.export_salt != make(APP_SECRET="another").export_salt


def test_without_app_secret_the_previous_derivation_still_applies():
    s = make(DATABASE_URL="postgresql://one")
    assert s.verify_secret == make(DATABASE_URL="postgresql://one").verify_secret
    assert make(SUPABASE_URL="https://x.supabase.co").export_salt == "https://x.supabase.co"
