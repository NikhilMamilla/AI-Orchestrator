from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ConceptMastery(BaseModel):
    concept_id: str  # knowledge-base document id (slug)
    mastery_level: float = Field(ge=0, le=1, default=0.0)
    first_attempted: datetime = Field(default_factory=datetime.utcnow)
    last_practiced: datetime = Field(default_factory=datetime.utcnow)
    attempts_count: int = 0
    avg_score: float = 0.0
    retention_score: float = 0.0
    next_review_due: Optional[datetime] = None

class LearningStyle(BaseModel):
    primary_modality: str  # visual, auditory, reading, kinesthetic
    confidence_score: float = Field(ge=0, le=1)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

class OverallStats(BaseModel):
    total_sessions: int = 0
    total_time_minutes: int = 0
    concepts_mastered: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    avg_session_length: float = 0.0

class StudentProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str  # Supabase auth user id (uuid)
    learning_style: LearningStyle = Field(default_factory=lambda: LearningStyle(primary_modality="visual", confidence_score=0.5))
    concept_mastery: List[ConceptMastery] = Field(default_factory=list)
    overall_stats: OverallStats = Field(default_factory=OverallStats)
    patterns: dict = Field(default_factory=dict)
    current_learning_path: List[Any] = Field(default_factory=list)
    current_goal: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
