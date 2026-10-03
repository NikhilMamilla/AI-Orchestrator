import logging
from collections import defaultdict
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException

from backend.app.security import User, get_current_user
from backend.app.learning.diagnostic import effective_mastery
from backend.app.services.concept_service import ConceptService
from backend.app.services.database import Database, get_database
from backend.app.services.rag_service import get_store
from backend.app.services.student_profile_service import StudentProfileService

logger = logging.getLogger(__name__)
router = APIRouter()

DOMAIN_COLORS = {
    "foundations": "#D4882B",
    "data-structures": "#2F6FB5",
    "algorithms": "#2D7A4F",
    "advanced-algorithms": "#B04A78",
}
MASTERED, READY = 0.8, 0.6


async def _concept_service() -> ConceptService:
    return ConceptService(await get_store())


@router.get("/")
async def list_concepts():
    concepts = await (await _concept_service()).list_concepts()
    return [c.model_dump(mode="json", exclude={"content"}) for c in concepts]


@router.get("/detail/{concept_id}")
async def get_concept(concept_id: str):
    concept = await (await _concept_service()).get_concept_by_id(concept_id)
    if not concept:
        raise HTTPException(404, "Concept not found")
    return concept.model_dump(mode="json")


def layout(concepts) -> Dict[str, dict]:
    """Layered DAG layout: column = longest prerequisite chain, rows spread within a column."""
    ids = {c.id for c in concepts}
    prereqs = {c.id: [p for p in c.prerequisites if p in ids] for c in concepts}
    depth: Dict[str, int] = {}

    def d(i: str, seen=()) -> int:
        if i in depth:
            return depth[i]
        if i in seen:                       # defensive: a cycle in metadata must not recurse forever
            return 0
        depth[i] = 1 + max((d(p, seen + (i,)) for p in prereqs[i]), default=-1)
        return depth[i]

    for c in concepts:
        d(c.id)
    cols: Dict[int, List[str]] = defaultdict(list)
    for c in sorted(concepts, key=lambda c: (c.domain, c.difficulty_level, c.title)):
        cols[depth[c.id]].append(c.id)
    pos = {}
    for col, members in cols.items():
        for row, cid in enumerate(members):
            pos[cid] = {"x": 90 + col * 200, "y": 70 + row * 95}
    return pos


def band_of(m: float) -> str:
    """The PRD's four mastery bands (8.1-B): green > 80%, yellow 60-80%, orange 40-60%, red < 40%."""
    if m <= 0:
        return "untouched"
    return "mastered" if m >= 0.80 else "partial" if m >= 0.60 else "weak" if m >= 0.40 else "needs_work"


@router.get("/map/")
async def get_concept_map(user: User = Depends(get_current_user), db: Database = Depends(get_database)):
    """Prerequisite graph with the caller's own mastery (identity comes from the verified token)."""
    profile_service = StudentProfileService(db)
    profile = await profile_service.get_profile_by_user_id(user.uid) or await profile_service.create_profile_safe(user.uid)
    concepts = await (await _concept_service()).outline()                  # metadata only: no per-concept content queries
    mastery = {str(m.concept_id): m.mastery_level for m in profile.concept_mastery}
    unlock = effective_mastery(mastery, profile.patterns.get("diagnostic"))   # placement-assumed concepts unlock, but are not 'mastered'
    ids = {c.id for c in concepts}
    pos = layout(concepts)

    nodes = []
    for c in concepts:
        m = mastery.get(c.id, 0.0)
        prereqs_done = all(unlock.get(p, 0.0) >= READY for p in c.prerequisites if p in ids)
        status = "mastered" if m >= MASTERED else "learning" if (m > 0 or prereqs_done) else "locked"
        nodes.append({"id": c.id, "slug": c.id, "title": c.title, "domain": c.domain,
                      "difficulty": c.difficulty_level, "mastery_level": m, "status": status, "band": band_of(m),
                      "color": DOMAIN_COLORS.get(c.domain, "#7A6B5D"), **pos[c.id]})
    links = [{"source": p, "target": c.id} for c in concepts for p in c.prerequisites if p in ids]
    return {"concepts": nodes, "links": links}
