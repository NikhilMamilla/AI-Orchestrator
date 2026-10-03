"""Apply supabase/migrations/*.sql to DATABASE_URL, once each, in order.

    python scripts/migrate.py

Applied files are recorded in `schema_migrations`. If the database already has the tables from
0001 (applied by hand in the SQL editor) but no tracking table, 0001 is recorded as applied.
"""
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import settings  # noqa: E402


def main() -> None:
    if not settings.DATABASE_URL:
        sys.exit("DATABASE_URL is not set (backend/.env)")
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    with psycopg.connect(settings.DATABASE_URL, autocommit=True, connect_timeout=15) as c:
        c.execute("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())")
        applied = {r[0] for r in c.execute("select name from schema_migrations")}
        if not applied and c.execute("select to_regclass('public.documents')").fetchone()[0]:
            c.execute("insert into schema_migrations(name) values ('0001_init.sql')")
            applied.add("0001_init.sql")
            print("recorded 0001_init.sql as already applied")
        for f in files:
            if f.name in applied:
                print("skip   ", f.name)
                continue
            with c.transaction():
                c.execute(f.read_text(encoding="utf-8"))
                c.execute("insert into schema_migrations(name) values (%s)", (f.name,))
            print("applied", f.name)


if __name__ == "__main__":
    main()
