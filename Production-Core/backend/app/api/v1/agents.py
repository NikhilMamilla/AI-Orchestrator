"""Direct access to the five agents (the app itself drives them through sessions and the WebSocket).

Every route requires a signed-in user (router dependency in main.py). Routes about a learner act on the caller only:
a `student_id` in the request must be the caller's own (or omitted), never someone else's.
"""
import logging
from typing import Any, Awaitable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.security import User, get_current_user
from backend.app.services.agent_factory import AgentFactory
from backend.app.services.database import get_database
from backend.app.services.rag_service import get_pipeline

router = APIRouter()
logger = logging.getLogger(__name__)


async def _factory(db) -> AgentFactory:
    return AgentFactory(db, store=(await get_pipeline()).store)


async def _call(work: Awaitable[Any]) -> Any:
    """One error policy for every agent call: HTTP errors pass through, anything else is logged and becomes a 500."""
    try:
        return await work
    except HTTPException:
        raise
    except Exception:
        logger.exception("agent endpoint failed")
        raise HTTPException(status_code=500, detail="Internal error")


def _own(student_id: Optional[str], user: User) -> str:
    """The learner a request is about is always the caller."""
    if student_id not in (None, "", "me", user.uid):
        raise HTTPException(status_code=403, detail="You can only analyse your own learning")
    return user.uid


class ContentRequest(BaseModel):
    concept_query: str = Field(min_length=1, max_length=500)
    student_level: str = Field(default="beginner", max_length=32)
    context: Optional[Dict[str, Any]] = None


class TeachingRequest(BaseModel):
    content_package: Dict[str, Any]
    student_context: Dict[str, Any]


class GenerateRequest(BaseModel):
    concept: Dict[str, Any]
    student_context: Dict[str, Any]
    assessment_type: str = Field(default="comprehensive", max_length=32)


class EvaluateRequest(BaseModel):
    assessment: Dict[str, Any]
    student_answers: List[Dict[str, Any]] = Field(max_length=200)
    context: Optional[Dict[str, Any]] = None


class SessionAnalysisRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    session_data: Dict[str, Any]
    student_id: Optional[str] = None                   # optional: the caller is always the learner


class PredictionRequest(BaseModel):
    concept_id: str = Field(min_length=1, max_length=120)
    context: Optional[Dict[str, Any]] = None
    student_id: Optional[str] = None


@router.post("/knowledge/retrieve")
async def retrieve_content(request: ContentRequest, db=Depends(get_database)):
    async def work():
        package = await (await _factory(db)).create_knowledge_agent().retrieve_content(
            concept_query=request.concept_query, student_level=request.student_level, context=request.context)
        if "error" in package:
            raise HTTPException(status_code=404, detail=package["error"])
        return package
    return await _call(work())


@router.get("/knowledge/prerequisites/{concept_id}")
async def get_prerequisites(concept_id: str, db=Depends(get_database)):
    async def work():
        return {"prerequisites": await (await _factory(db)).create_knowledge_agent().get_prerequisites_content(concept_id)}
    return await _call(work())


@router.post("/teaching/teach")
async def teach_concept(request: TeachingRequest, db=Depends(get_database)):
    async def work():
        return await (await _factory(db)).create_teaching_agent().teach_concept(
            content_package=request.content_package, student_context=request.student_context)
    return await _call(work())


@router.post("/assessment/generate")
async def generate_assessment(request: GenerateRequest, db=Depends(get_database)):
    async def work():
        return await (await _factory(db)).create_assessment_agent().generate_assessment(
            concept=request.concept, student_context=request.student_context, assessment_type=request.assessment_type)
    return await _call(work())


@router.post("/assessment/evaluate")
async def evaluate_assessment(request: EvaluateRequest, db=Depends(get_database)):
    async def work():
        return await (await _factory(db)).create_assessment_agent().evaluate_assessment(
            assessment=request.assessment, student_answers=request.student_answers, context=request.context)
    return await _call(work())


@router.post("/analyst/analyze-session")
async def analyze_session(request: SessionAnalysisRequest, user: User = Depends(get_current_user), db=Depends(get_database)):
    student = _own(request.student_id, user)

    async def work():
        return await (await _factory(db)).create_analyst_agent().analyze_session(
            session_id=request.session_id, session_data=request.session_data, student_id=student)
    return await _call(work())


@router.post("/analyst/predict-performance")
async def predict_performance(request: PredictionRequest, user: User = Depends(get_current_user), db=Depends(get_database)):
    student = _own(request.student_id, user)

    async def work():
        return await (await _factory(db)).create_analyst_agent().predict_performance(
            student_id=student, concept_id=request.concept_id, context=request.context)
    return await _call(work())


@router.get("/analyst/long-term-progress/{student_id}")
async def get_long_term_progress(student_id: str, days: int = Query(30, ge=1, le=365),
                                 user: User = Depends(get_current_user), db=Depends(get_database)):
    """`student_id` must be the caller's own id (or `me`)."""
    student = _own(student_id, user)

    async def work():
        return await (await _factory(db)).create_analyst_agent().analyze_long_term_progress(
            student_id=student, time_period_days=days)
    return await _call(work())
