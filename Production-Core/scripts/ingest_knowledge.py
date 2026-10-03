"""Ingest data/knowledge (and optionally extra files) into the knowledge store.

    python scripts/ingest_knowledge.py [--local] [extra_file ...]

Incremental: unchanged documents are skipped; changed ones are re-chunked and re-embedded with a
version bump. Uses Supabase Postgres when DATABASE_URL is set, else a local SQLite file.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import settings  # noqa: E402
from backend.app.rag.embeddings import load_embedder  # noqa: E402
from backend.app.rag.ingest import Ingestor  # noqa: E402
from backend.app.rag.store import KnowledgeStore  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="force local SQLite even if DATABASE_URL is set")
    ap.add_argument("files", nargs="*")
    args = ap.parse_args()

    if settings.DATABASE_URL and not args.local:
        from backend.app.rag.pg_store import PostgresKnowledgeStore
        store = PostgresKnowledgeStore(settings.DATABASE_URL)
        print("store: Supabase Postgres")
    else:
        store = KnowledgeStore(settings.RAG_DB_PATH)
        print("store: local SQLite", settings.RAG_DB_PATH)
    embedder = load_embedder(prefer_neural=True)
    print("embedder:", embedder.name)
    ing = Ingestor(store, embedder)
    rep = ing.ingest_directory(ROOT / "data" / "knowledge")
    for f in args.files:
        sub = ing.ingest_bytes(Path(f).name, Path(f).read_bytes())
        rep.added += sub.added
        rep.updated += sub.updated
        rep.failed.update(sub.failed)
    print(f"added={len(rep.added)} updated={len(rep.updated)} unchanged={len(rep.unchanged)} "
          f"failed={rep.failed} duplicates_dropped={rep.duplicate_passages_dropped} "
          f"quarantined={rep.quarantined_spans}")
    print("stats:", store.stats())


if __name__ == "__main__":
    main()
