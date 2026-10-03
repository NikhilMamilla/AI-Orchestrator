"""Ingestion: parse -> normalise -> scan for injection -> chunk -> dedupe -> embed -> store.

Incremental: a document whose content hash is unchanged is skipped; a changed one is
re-chunked and swapped atomically with `version` incremented. Duplicate passages
(same normalised text already present in another document) are dropped.
"""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from .chunking import chunk_markdown, embed_text, normalize, parse_front_matter, sha
from .guard import scan_for_injection
from .store import KnowledgeStore
from .types import LEVELS, Document

logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 2_000_000
ALLOWED_SUFFIXES = {".md", ".markdown", ".txt", ".pdf"}
_SLUG = re.compile(r"[^a-z0-9]+")


class IngestError(ValueError):
    pass


@dataclass
class IngestReport:
    added: List[str] = field(default_factory=list)
    updated: List[str] = field(default_factory=list)
    unchanged: List[str] = field(default_factory=list)
    failed: Dict[str, str] = field(default_factory=dict)
    duplicate_passages_dropped: int = 0
    quarantined_spans: int = 0


def slugify(s: str) -> str:
    return _SLUG.sub("-", s.lower()).strip("-")[:64] or "doc"


def _pdf_to_text(data: bytes) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise IngestError("encrypted PDF not supported")
        return "\n\n".join((p.extract_text() or "") for p in reader.pages[:200])
    except IngestError:
        raise
    except Exception as e:
        raise IngestError(f"unreadable PDF: {e}") from e


def parse_bytes(name: str, data: bytes) -> tuple[Dict[str, object], str]:
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise IngestError(f"unsupported file type '{suffix}'")
    if len(data) > MAX_UPLOAD_BYTES:
        raise IngestError("file too large")
    if not data.strip():
        raise IngestError("empty file")
    if suffix == ".pdf":
        if not data.startswith(b"%PDF"):
            raise IngestError("file is not a valid PDF")
        return {}, _pdf_to_text(data)
    try:
        raw = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise IngestError("file is not valid UTF-8 text") from e
    if "\x00" in raw:
        raise IngestError("binary content detected")
    return parse_front_matter(raw)


class Ingestor:
    def __init__(self, store: KnowledgeStore, embedder):
        self.store, self.embedder = store, embedder

    def ingest_text(self, name: str, meta: Dict[str, object], body: str,
                    report: Optional[IngestReport] = None) -> IngestReport:
        report = report or IngestReport()
        stem = Path(name).stem
        title = str(meta.get("title") or stem.replace("-", " ").replace("_", " ").title())
        doc_id = slugify(str(meta.get("id") or stem))
        level_raw = str(meta.get("level", "beginner")).lower()
        level = LEVELS.get(level_raw, int(level_raw) if level_raw.isdigit() and 1 <= int(level_raw) <= 3 else 1)
        prereqs = [slugify(p) for p in (meta.get("prerequisites") or [])]  # type: ignore[union-attr]
        tags = [str(t).lower() for t in (meta.get("tags") or [])]            # type: ignore[union-attr]

        body = normalize(body)
        if len(body) < 40:
            raise IngestError("document has too little content")
        content_hash = sha(f"{title}\n{level}\n{body}")

        existing = self.store.get_document(doc_id)
        if existing and existing.content_hash == content_hash:
            report.unchanged.append(doc_id)
            return report

        # Indirect-prompt-injection defence at ingest time: neutralise instruction-like spans.
        body, n_flagged = scan_for_injection(body, mode="quarantine")
        report.quarantined_spans += n_flagged

        chunks = chunk_markdown(doc_id, title, body, level, tags)
        known = self.store.known_text_hashes(exclude_doc=doc_id)
        keep, hashes, seen_here = [], {}, set()
        for c in chunks:
            h = sha(re.sub(r"\s+", " ", c.text.lower()))
            if c.kind == "passage":
                if h in known or h in seen_here:
                    report.duplicate_passages_dropped += 1
                    continue
                seen_here.add(h)
            hashes[c.id] = h
            keep.append(c)
        passages = [c for c in keep if c.kind == "passage"]
        if not passages:
            raise IngestError("no indexable passages after deduplication")
        vecs = self.embedder.encode_documents([embed_text(c) for c in passages])
        embeddings = {c.id: v for c, v in zip(passages, vecs)}

        doc = Document(id=doc_id, title=title, source=name, level=level,
                       domain=slugify(str(meta.get("domain") or "foundations")), prerequisites=prereqs,
                       tags=tags, content_hash=content_hash,
                       version=(existing.version + 1) if existing else 1)
        self.store.replace_document(doc, keep, hashes, embeddings)
        (report.updated if existing else report.added).append(doc_id)
        return report

    def ingest_bytes(self, name: str, data: bytes) -> IngestReport:
        report = IngestReport()
        try:
            meta, body = parse_bytes(name, data)
            return self.ingest_text(name, meta, body, report)
        except IngestError as e:
            report.failed[name] = str(e)
        except Exception as e:                                  # never let one bad file kill a batch
            logger.exception("ingest failed for %s", name)
            report.failed[name] = f"unexpected error: {type(e).__name__}"
        return report

    def ingest_directory(self, directory: str | Path) -> IngestReport:
        report = IngestReport()
        for p in sorted(Path(directory).glob("*")):
            if p.suffix.lower() not in ALLOWED_SUFFIXES:
                continue
            sub = self.ingest_bytes(p.name, p.read_bytes())
            report.added += sub.added
            report.updated += sub.updated
            report.unchanged += sub.unchanged
            report.failed.update(sub.failed)
            report.duplicate_passages_dropped += sub.duplicate_passages_dropped
            report.quarantined_spans += sub.quarantined_spans
        return report
