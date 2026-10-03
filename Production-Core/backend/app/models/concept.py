from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CodeExample(BaseModel):
    language: str
    code: str
    explanation: str


class ConceptContent(BaseModel):
    definition: str
    explanation_beginner: str
    explanation_intermediate: Optional[str] = None
    explanation_advanced: Optional[str] = None
    code_examples: List[CodeExample] = Field(default_factory=list)
    visual_aids: List[str] = Field(default_factory=list)
    common_mistakes: List[str] = Field(default_factory=list)
    real_world_applications: List[str] = Field(default_factory=list)


class Concept(BaseModel):
    """A teachable concept. Derived from the knowledge-base document of the same id (slug), so the
    tutor's agents and the RAG pipeline always read one source of truth."""
    id: str
    title: str
    slug: str
    domain: str
    description: str
    difficulty_level: int = Field(ge=1, le=5)
    estimated_time_minutes: int
    prerequisites: List[str] = Field(default_factory=list)
    related_concepts: List[str] = Field(default_factory=list)
    leads_to: List[str] = Field(default_factory=list)
    content: ConceptContent
    tags: List[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
