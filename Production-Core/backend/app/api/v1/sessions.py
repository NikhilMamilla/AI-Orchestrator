from fastapi import APIRouter, Depends, HTTPException
import logging
from backend.app.security import User, get_current_user
from backend.app.services.database import get_database
from backend.app.services.student_profile_service import StudentProfileService
from pydantic import BaseModel
from typing import Optional, Dict

logger = logging.getLogger(__name__)
router = APIRouter()

class StartSessionRequest(BaseModel):
    student_id: str
    initial_concept_id: Optional[str] = None
    available_time_minutes: int = 40

class ProcessResponseRequest(BaseModel):
    session_id: str
    student_id: str
    response_data: Dict
    session_state: Dict

@router.post("/start")
async def start_session(
    request: StartSessionRequest,
    user: User = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Start a new learning session
    
    This kicks off the orchestrated learning loop
    """
    try:
        from backend.app.services.llm import LLMService
        from backend.app.config import settings
        from backend.app.services.message_queue import MessageQueue
        from backend.app.agents.orchestrator.agent import OrchestratorAgent
        
        # Get student profile
        profile_service = StudentProfileService(db)
        profile = await profile_service.get_profile_by_user_id(user.uid)
        
        if not profile:
            raise HTTPException(status_code=404, detail="Student profile not found")
        
        # Initialize Orchestrator
        llm_service = LLMService()
        message_queue = MessageQueue(settings.REDIS_URL)
        await message_queue.connect()
        
        orchestrator = OrchestratorAgent(llm_service, message_queue)
        
        # Start session
        session_data = await orchestrator.start_learning_session(
            student_id=user.uid,
            student_profile=profile.model_dump(),
            initial_concept_id=request.initial_concept_id,
            available_time_minutes=request.available_time_minutes
        )
        
        return session_data
    
    except HTTPException:
        raise
    except Exception:
        logger.exception("session endpoint failed")
        raise HTTPException(status_code=500, detail="Internal error")


@router.post("/process-response")
async def process_response(
    request: ProcessResponseRequest,
    user: User = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Process student's response and get next action
    
    This is the core of the adaptive learning loop
    """
    try:
        from backend.app.services.llm import LLMService
        from backend.app.config import settings
        from backend.app.services.message_queue import MessageQueue
        from backend.app.agents.orchestrator.agent import OrchestratorAgent
        
        llm_service = LLMService()
        message_queue = MessageQueue(settings.REDIS_URL)
        await message_queue.connect()
        
        orchestrator = OrchestratorAgent(llm_service, message_queue)
        
        next_action = await orchestrator.process_student_response(
            session_id=request.session_id,
            student_id=user.uid,
            response_data=request.response_data,
            session_state=request.session_state
        )
        
        return next_action
    
    except HTTPException:
        raise
    except Exception:
        logger.exception("session endpoint failed")
        raise HTTPException(status_code=500, detail="Internal error")


@router.post("/plan-learning-path")
async def plan_learning_path(
    request: Dict,
    user: User = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Generate complete learning path from current to goal
    """
    try:
        from backend.app.agents.orchestrator.session_planner import SessionPlanner
        from backend.app.services.student_profile_service import StudentProfileService
        
        planner = SessionPlanner()
        profile_service = StudentProfileService(db)
        
        student_id = user.uid
             
        profile = await profile_service.get_profile_by_user_id(student_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Student profile not found")
        
        learning_path = planner.plan_learning_path(
            start_concept_id=request["start_concept_id"],
            goal_concept_id=request["goal_concept_id"],
            student_profile=profile.model_dump(),
            timeline_days=request.get("timeline_days", 60)
        )
        
        return learning_path
    
    except HTTPException:
        raise
    except Exception:
        logger.exception("session endpoint failed")
        raise HTTPException(status_code=500, detail="Internal error")
