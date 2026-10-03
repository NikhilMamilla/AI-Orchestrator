from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from backend.app.services.database import get_database
from backend.app.services.student_profile_service import StudentProfileService
from backend.app.services.message_queue import MessageQueue
from backend.app.agents.orchestrator.agent import OrchestratorAgent
from backend.app.services.llm import LLMService
from backend.app.config import settings
from backend.app.security import AuthError, authenticate_websocket
from backend.app.services.activity import make_sink
import json
import logging
import asyncio
import traceback
from typing import Dict

logger = logging.getLogger(__name__)

router = APIRouter()

class ConnectionManager:
    """Manage WebSocket connections"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.stop_signals: set[str] = set()
    
    @staticmethod
    def key(user_id: str, session_id: str) -> str:
        """Connections are keyed by the verified user as well as the session id the client chose: two learners
        using the same id (the app opens every session as "active") must never share, or replace, a connection."""
        return f"{user_id}:{session_id}"

    def register(self, websocket: WebSocket, key: str):
        """Store an accepted, authenticated connection (never before authentication)."""
        self.active_connections[key] = websocket
        logger.info("WebSocket registered: %s", key)
    
    def disconnect(self, session_id: str, websocket: WebSocket):
        """Remove WebSocket connection safely"""
        if self.active_connections.get(session_id) == websocket:
            del self.active_connections[session_id]
            if session_id in self.stop_signals:
                self.stop_signals.remove(session_id)
            logger.info(f"WebSocket disconnected: {session_id}")

    def interrupt_stream(self, session_id: str):
        """Signal a stream interruption for a session"""
        self.stop_signals.add(session_id)
        logger.info(f"Stream interruption signaled for: {session_id}")

    def is_interrupted(self, session_id: str) -> bool:
        """Check if a stream has been interrupted and clear the signal if so"""
        if session_id in self.stop_signals:
            self.stop_signals.remove(session_id)
            return True
        return False
    
    async def send_message(self, session_id: str, message: dict):
        """Send message to specific connection"""
        if session_id in self.active_connections:
            websocket = self.active_connections[session_id]
            await websocket.send_json(message)
    
    async def send_streaming_message(self, session_id: str, text: str, message_type: str = "agent_response"):
        """Send message with streaming effect (character by character)"""
        if session_id not in self.active_connections:
            return
        
        websocket = self.active_connections[session_id]
        
        # Send start signal
        await websocket.send_json({
            "type": "stream_start",
            "message_type": message_type
        })
        
        # Stream characters
        for char in text:
            # Check for interruption signal
            if session_id in self.stop_signals:
                self.stop_signals.remove(session_id)
                logger.info(f"Streaming interrupted for session: {session_id}")
                break

            await websocket.send_json({
                "type": "stream_chunk",
                "chunk": char
            })
            await asyncio.sleep(0.02)  # Medium speed for readability
        
        # Send end signal
        await websocket.send_json({
            "type": "stream_end",
            "message_type": message_type,
            "full_text": text
        })

manager = ConnectionManager()


@router.websocket("/session/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    db = Depends(get_database)
):
    """
    WebSocket endpoint for real-time learning session
    """
    
    await websocket.accept()
    try:
        # The browser cannot send headers on a WebSocket, so the token arrives as the first message
        # ({"type":"auth","token":...}) instead of in the URL (which would be logged).
        ws_user = await asyncio.wait_for(authenticate_websocket(websocket), timeout=10)
    except asyncio.TimeoutError:
        await websocket.close(code=4401, reason="authentication timed out")
        return
    except (AuthError, WebSocketDisconnect):
        return                                          # never registered: an unauthenticated socket can't touch another
    # from here on the session is the verified user's own: every send below is routed by this scoped key
    session_id = manager.key(ws_user.uid, session_id)
    manager.register(websocket, session_id)
    logger.info("WebSocket authenticated for session %s", session_id)
    
    try:
        # Initialize services
        logger.debug(f"Initializing services for session {session_id}")
        llm_service = LLMService()
        message_queue = MessageQueue(settings.REDIS_URL)
        await message_queue.connect()
        logger.debug(f"Services ready for session {session_id}")
        
        profile_service = StudentProfileService(db)
        orchestrator = OrchestratorAgent(llm_service, message_queue)
        orchestrator.event_sink = make_sink(db, ws_user.uid)
        
        # Session state
        session_state = {
            "session_id": session_id,
            "current_concept_id": None,
            "current_question": None,
            "evaluations": [],
            "interactions": [],
            "student_profile": None,
            "elapsed_minutes": 0,
            "user_id": ws_user.uid,          # the verified user: never an id sent by the client
        }
    
        # Task-based message receiver to allow concurrent "stop" signals
        async def message_processor(msg_type, payload):
            try:
                if msg_type == "start_session":
                    await handle_start_session(
                        websocket, session_id, payload, orchestrator, profile_service, session_state
                    )
                elif msg_type == "student_response":
                    await handle_student_response(
                        websocket, session_id, payload, orchestrator, session_state
                    )
                elif msg_type == "request_hint":
                    await handle_hint_request(websocket, session_id, session_state)
                elif msg_type == "end_session":
                    await handle_end_session(websocket, session_id, session_state, profile_service)
                    return True # Signal to break main loop
            except Exception as e:
                logger.error(f"Error processing {msg_type}: {e}")
                traceback.print_exc()
            return False

        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                msg_type = message.get("type")
                payload = message.get("payload", {})
                
                if msg_type == "stop_generation":
                    logger.debug(f"Immediate interrupt for session {session_id}")
                    manager.interrupt_stream(session_id)
                    continue

                if msg_type == "end_session":
                    await handle_end_session(websocket, session_id, session_state, profile_service)
                    break
                
                # Run other handlers in background to keep loop responsive for "stop"
                asyncio.create_task(message_processor(msg_type, payload))
                
            except WebSocketDisconnect:
                logger.debug(f"WebSocketDisconnect caught in loop for session {session_id}")
                break
            except Exception as e:
                logger.debug(f"Error in session {session_id} loop: {e}")
                import traceback
                traceback.print_exc()
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Server error. Please try again."
                    })
                except:
                    pass
                break # Signal to break main loop if we hit a serious error
                
    except Exception:
        logger.exception("WebSocket session %s failed", session_id)
        try:                                            # tell the client and close, so it never waits on a dead session
            await websocket.send_json({"type": "error", "message": "Server error. Please try again."})
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        manager.disconnect(session_id, websocket)
        try:
            if 'message_queue' in locals():
                await message_queue.disconnect()
        except Exception:
            pass


async def handle_start_session(
    websocket: WebSocket,
    session_id: str,
    payload: dict,
    orchestrator: OrchestratorAgent,
    profile_service: StudentProfileService,
    session_state: dict
):
    """Handle session start request"""
    
    student_id = session_state["user_id"]          # from the verified token, not the payload
    initial_concept_id = payload.get("initial_concept_id")
    available_time_minutes = payload.get("available_time_minutes", 40)
    
    # Get student profile
    try:
        logger.debug(f"[WS] Fetching profile for student_id: {student_id}")
        profile = await profile_service.get_profile_by_user_id(student_id)
        if not profile:
            logger.debug(f"[WS] Profile not found. Creating new profile for {student_id}")
            profile = await profile_service.create_profile_safe(student_id)
            logger.debug(f"[WS] Profile created successfully for {student_id}")
        else:
            logger.debug(f"[WS] Profile found for {student_id}")
        
        session_state["student_profile"] = profile.model_dump()
    except Exception as e:
        logger.debug(f"[WS] ERROR in handle_start_session (profile): {e}")
        traceback.print_exc()
        await websocket.send_json({
            "type": "error",
            "message": f"Critical error initializing your profile: {str(e)}"
        })
        return
    
    # Discovery Phase: Greet the user instead of jumping straight into a lesson
    try:
        logger.debug(f"[WS] Generating initial greeting...")
        greeting = await orchestrator.get_initial_greeting(
            student_profile=profile.model_dump(),
            session_id=session_id
        )
        
        # Update session state
        session_state["interactions"].append({
            "role": "assistant",
            "content": greeting,
            "timestamp": datetime.now().isoformat()
        })
        
        # Stream the greeting
        logger.debug(f"[WS] Streaming greeting...")
        await manager.send_streaming_message(session_id, greeting, "tutor_greeting")
    except Exception as e:
        logger.debug(f"[WS] ERROR in handle_start_session (greeting): {e}")
        traceback.print_exc()
    
    # We still pre-plan the session in background but don't force a move yet
    # unless the user asks for it or it's implicitly clear
    logger.debug(f"[WS] Discovery phase active.")
    
    # Discovery phase active.
    
    # Send session started confirmation
    await websocket.send_json({
        "type": "session_started",
        "status": "discovery"
    })
    
async def handle_student_response(
    websocket: WebSocket,
    session_id: str,
    payload: dict,
    orchestrator: OrchestratorAgent,
    session_state: dict
):
    """Handle student's response with conversational support"""
    
    response_type = payload.get("response_type", "chat")
    answer = payload.get("answer")
    
    # SAFEGUARD: Ensure student_profile exists
    if not session_state.get("student_profile"):
        logger.warning(f"Session {session_id} missing student_profile. Attempting to recover.")
        # Try to recover from the payload if available, or error out safely
        student_id_from_payload = session_state.get("user_id")     # the verified user, not the payload
        if student_id_from_payload:
             # Just a temporary patch to prevent crash, ideally we reload profile
             session_state["student_profile"] = {"user_id": student_id_from_payload, "name": "Student"}
        else:
             logger.error(f"Cannot process response for session {session_id}: No student profile matched.")
             await websocket.send_json({
                 "type": "error",
                 "message": "Session state invalid. Please refresh the page."
             })
             return
    
    # Log interaction
    interaction = {
        "role": "user",
        "type": response_type,
        "content": answer,
        "timestamp": datetime.now().isoformat()
    }
    session_state["interactions"].append(interaction)
    
    # Process with orchestrator
    next_action = await orchestrator.process_student_response(
        session_id=session_id,
        student_id=session_state["student_profile"]["user_id"],
        response_data={"interaction_type": response_type, "answer": answer},
        session_state=session_state
    )
    
    # Handle different actions
    action_type = next_action.get("action")
    
    if action_type == "chat_reply":
        # Send conversational reply with streaming
        await manager.send_streaming_message(
            session_id,
            next_action["content"],
            "tutor_response"
        )
        
    elif action_type == "provide_clarification":
        # Send clarification with streaming
        await manager.send_streaming_message(
            session_id,
            next_action["content"],
            "clarification"
        )
    
    elif action_type == "ask_question":
        # Send next assessment question
        await websocket.send_json({
            "type": "question",
            "question": next_action["question"]
        })
        session_state["current_question"] = next_action["question"]
    
    elif action_type == "advance":
        # Moving to next concept
        await websocket.send_json({
            "type": "agent_decision",
            "decision": "advance",
            "reasoning": next_action["reasoning"],
            "next_concept": next_action["next_concept"]
        })
        
        # Stream new lesson
        if "lesson" in next_action:
            await asyncio.sleep(1)
            lesson_content = next_action["lesson"]["lesson_content"]
            if isinstance(lesson_content, dict):
                lesson_content = lesson_content.get("content", str(lesson_content))
                
            await manager.send_streaming_message(
                session_id,
                lesson_content,
                "teaching_content"
            )
    
    elif action_type == "review":
        await websocket.send_json({
            "type": "agent_decision",
            "decision": "review",
            "reasoning": next_action["reasoning"]
        })
    
    elif action_type == "suggest_break":
        await websocket.send_json({
            "type": "agent_decision",
            "decision": "break",
            "reasoning": next_action["reasoning"],
            "break_duration_minutes": next_action.get("break_duration_minutes", 15)
        })
    
    elif action_type == "continue_teaching":
        await websocket.send_json({
            "type": "status",
            "message": "Great! Let's continue..."
        })
    
    # Send progress update
    mastery_level = calculate_current_mastery(session_state)
    await websocket.send_json({
        "type": "progress_update",
        "mastery_level": mastery_level,
        "questions_answered": len(session_state["evaluations"]),
        "elapsed_minutes": session_state["elapsed_minutes"]
    })


async def handle_hint_request(
    websocket: WebSocket,
    session_id: str,
    session_state: dict
):
    """Handle student's request for hint"""
    
    current_question = session_state.get("current_question")
    
    if not current_question:
        await websocket.send_json({
            "type": "error",
            "message": "No active question to provide hint for"
        })
        return
    
    # Get hints from question
    hints = current_question.get("hints", [])
    
    if hints:
        await websocket.send_json({
            "type": "hint",
            "hint": hints[0]  # First hint
        })
    else:
        await websocket.send_json({
            "type": "hint",
            "hint": "Try breaking down the problem into smaller steps."
        })


async def handle_end_session(
    websocket: WebSocket,
    session_id: str,
    session_state: dict,
    profile_service: StudentProfileService
):
    """Handle session end"""
    
    # Calculate final metrics
    total_questions = len(session_state["evaluations"])
    correct_answers = sum(1 for e in session_state["evaluations"] if e.get("is_correct", False))
    
    # Send session summary
    await websocket.send_json({
        "type": "session_ended",
        "summary": {
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "accuracy": correct_answers / total_questions if total_questions > 0 else 0,
            "time_spent_minutes": session_state["elapsed_minutes"],
            "concepts_covered": [session_state["current_concept_id"]]
        }
    })


def calculate_current_mastery(session_state: dict) -> float:
    """Calculate current mastery level from evaluations"""
    evaluations = session_state.get("evaluations", [])
    
    if not evaluations:
        return 0.0
    
    scores = [e.get("score", 0) for e in evaluations]
    return sum(scores) / len(scores)
