"""Shared data types for the RAG pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

LEVELS = {"beginner": 1, "intermediate": 2, "advanced": 3}


@dataclass
class Chunk:
    """A retrievable passage. `parent_id` points at its section-level chunk."""
    id: str
    doc_id: str
    parent_id: Optional[str]
    kind: str               # "section" (parent) or "passage" (child)
    heading_path: str       # e.g. "Binary Search > Pitfalls"
    text: str
    ordinal: int
    level: int              # 1..3 difficulty inherited from document
    tags: str = ""


@dataclass
class Document:
    id: str
    title: str
    source: str
    level: int
    domain: str
    prerequisites: List[str]
    tags: List[str]
    content_hash: str
    version: int = 1


@dataclass
class Candidate:
    """A chunk travelling through the pipeline with per-stage evidence."""
    chunk: Chunk
    dense_score: float = 0.0
    bm25_score: float = 0.0
    dense_rank: Optional[int] = None
    bm25_rank: Optional[int] = None
    fused_score: float = 0.0
    rerank_score: Optional[float] = None
    via: List[str] = field(default_factory=list)   # which retrievers/queries found it


@dataclass
class Evidence:
    """A citable unit handed to the generator, numbered [1], [2], ..."""
    ref: int
    chunk_id: str
    doc_id: str
    doc_title: str
    heading_path: str
    text: str
    score: float


@dataclass
class QueryPlan:
    original: str
    intent: str                      # definition | how_to | complexity | compare | debug | code | other
    rewrites: List[str]
    concepts: List[str]              # doc ids detected in the query
    level: Optional[int] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class Answer:
    text: str
    status: str                      # "grounded" | "insufficient_evidence" | "error"
    confidence: float
    citations: List[Dict[str, Any]]
    unsupported_claims: List[str]
    evidence: List[Evidence]
    trace: Dict[str, Any]
