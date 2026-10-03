"""Concepts are derived from the knowledge-base documents (single source of truth shared with RAG).

A document's markdown sections map onto the legacy Concept model the agents already consume:
Overview -> definition/beginner explanation, other prose sections -> intermediate/advanced
explanations, fenced blocks -> code examples, "Pitfalls" -> common mistakes, "Applications" ->
real-world uses.
"""
from __future__ import annotations

import asyncio
import re
from typing import List, NamedTuple, Optional

from backend.app.models.concept import CodeExample, Concept, ConceptContent
from backend.app.rag.types import Chunk, Document

_FENCE = re.compile(r"```(\w*)\n(.*?)```", re.S)
_SENT = re.compile(r"(?<=[.!?])\s+")


def _section_name(c: Chunk) -> str:
    return c.heading_path.split(" > ")[-1].strip().lower()


def _prose(text: str) -> str:
    return re.sub(r"\s+", " ", _FENCE.sub(" ", text)).strip()


def _sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENT.split(_prose(text)) if len(s.strip()) > 20]


class Outline(NamedTuple):
    id: str
    title: str
    domain: str
    difficulty_level: int
    prerequisites: List[str]


class ConceptService:
    """Read-only view over the knowledge store (SQLite or Supabase Postgres)."""

    def __init__(self, store):
        self.store = store

    def _build(self, doc: Document, sections: List[Chunk], dependents: List[str]) -> Concept:
        by_name = {_section_name(s): s for s in sections}
        overview = next((s for n, s in by_name.items() if n in ("overview", "the problem")),
                        sections[0] if sections else None)
        definition_text = " ".join(_sentences(overview.text)[:2]) if overview else ""
        definition_text = definition_text or doc.title
        pitfalls = next((s for n, s in by_name.items() if "pitfall" in n), None)
        apps = next((s for n, s in by_name.items()
                     if n.startswith("application") or ("where" in n and "used" in n)), None)
        explain = [s for s in sections if s is not overview and s is not pitfalls and s is not apps
                   and _prose(s.text)]
        beginner = _prose(overview.text) if overview else definition_text
        mid = " ".join(_prose(s.text) for s in explain[:2]) or None
        adv = " ".join(_prose(s.text) for s in explain[2:]) or None
        examples = [CodeExample(language=lang or "python", code=code.strip(),
                                explanation=f"{doc.title}: {_section_name(s)}")
                    for s in sections for lang, code in _FENCE.findall(s.text)]
        words = sum(len(s.text.split()) for s in sections)
        return Concept(
            id=doc.id, title=doc.title, slug=doc.id, domain=doc.domain, description=definition_text,
            difficulty_level=doc.level, estimated_time_minutes=max(5, round(words / 130) * 3),
            prerequisites=doc.prerequisites, leads_to=dependents, related_concepts=dependents[:3],
            content=ConceptContent(
                definition=definition_text, explanation_beginner=beginner,
                explanation_intermediate=mid, explanation_advanced=adv, code_examples=examples,
                common_mistakes=_sentences(pitfalls.text) if pitfalls else [],
                real_world_applications=_sentences(apps.text) if apps else []),
            tags=doc.tags)

    def _get(self, concept_id: str) -> Optional[Concept]:
        doc = self.store.get_document(concept_id)
        if not doc:
            return None
        deps = [d.id for d in self.store.list_documents() if doc.id in d.prerequisites]
        return self._build(doc, self.store.sections_for_doc(doc.id), deps)

    def _list(self, domain: Optional[str], limit: int) -> List[Concept]:
        docs = self.store.list_documents()
        out: List[Concept] = []
        for d in docs:
            if domain and d.domain != domain:
                continue
            deps = [x.id for x in docs if d.id in x.prerequisites]
            out.append(self._build(d, self.store.sections_for_doc(d.id), deps))
            if len(out) >= limit:
                break
        return out

    # The stores are synchronous (SQLite / psycopg pool): keep them off the event loop.
    async def get_concept_by_id(self, concept_id: str) -> Optional[Concept]:
        return await asyncio.to_thread(self._get, concept_id)

    async def get_concept_by_slug(self, slug: str) -> Optional[Concept]:
        return await asyncio.to_thread(self._get, slug)

    async def list_concepts(self, domain: Optional[str] = None, limit: int = 100) -> List[Concept]:
        return await asyncio.to_thread(self._list, domain, limit)

    async def outline(self) -> List[Outline]:
        """Graph skeleton from cached document metadata: one cheap call instead of one query per concept."""
        docs = await asyncio.to_thread(self.store.list_documents)
        return [Outline(d.id, d.title, d.domain, d.level, list(d.prerequisites)) for d in docs]

    async def get_prerequisites(self, concept_id: str) -> List[Concept]:
        concept = await self.get_concept_by_id(concept_id)
        if not concept:
            return []
        found = [await self.get_concept_by_id(p) for p in concept.prerequisites]
        return [c for c in found if c]
