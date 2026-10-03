
import uuid
import logging
from typing import Dict, List, Optional, Any

from backend.app.agents.orchestrator.decision_engine import DecisionEngine, DecisionType
from backend.app.agents.orchestrator.session_planner import SessionPlanner
from backend.app.services.message_queue import MessageQueue

logger = logging.getLogger(__name__)

class OrchestratorAgent:
    """
    Master Orchestrator Agent
    
    Responsibilities:
    - Coordinate all other agents
    - Make strategic decisions about learning journey
    - Plan sessions (short, medium, long-term)
    - Manage learning loop
    - Adapt entire system based on student needs
    """

    def __init__(
        self,
        llm_service: Any,
        message_queue: MessageQueue
    ):
        self.llm_service = llm_service
        self.message_queue = message_queue
        self.decision_engine = DecisionEngine()
        self.session_planner = SessionPlanner()
        self.agent_name = "orchestrator"
        
        # Fully detailed curriculum based on dsa_roadmap.md
        self.curriculum = [
            "1. Foundations (Complexity, Recursion, Bitwise basics)",
            "2. Arrays (Sliding Window, Two Pointers, Kadane’s, Matrix)",
            "3. Strings (Rabin–Karp, KMP, Z Algorithm, Tries)",
            "4. Bit Manipulation (Low-Level Magic, Subset generation)",
            "5. Mathematics for DSA (Primes, Sieve, Modular arithmetic)",
            "6. Recursion & Backtracking (N-Queens, Sudoku, Combinations)",
            "7. Linked List (Cycle Detection, Reversal, Doubly/Circular)",
            "8. Stack (Monotonic Stack, Expression Evaluation)",
            "9. Queue & Deque (Circular, Priority Queue, Monotonic)",
            "10. Hashing (HashMap internals, Collision handling)",
            "11. Sorting Algos (Quick/Merge/Heap, Linear sorts)",
            "12. Binary Search (Search on Answer, Rotated Arrays)",
            "13. Trees (DFS/BFS, LCA, Balanced Trees/AVL)",
            "14. Binary Search Tree (Validation, Kth smallest)",
            "15. Heaps (Heapify, Top K problems)",
            "16. Greedy Algos (Huffman, Activity Selection, Scheduling)",
            "17. Graph Algos (Dijkstra, MST, SCC, Bridges/Articulation)",
            "18. Dynamic Programming (Knapsack, LCS/LIS, Tree DP, Bitmask)",
            "19. Tries (Prefix match, XOR max pair)",
            "20. Segment Trees & Fenwick Tree (Range queries, Lazy prop)",
            "21. Advanced Topics (Mo's, SQRT Decomposition, Meet-in-middle)",
            "22. Interview Patterns (Fast/Slow Pointers, Cyclic Sort)"
        ]

    async def start_learning_session(
        self,
        student_id: str,
        student_profile: Dict,
        initial_concept_id: Optional[str] = None,
        available_time_minutes: int = 40
    ) -> Dict:
        """Start a new learning session"""
        print(f"DEBUG: [Orchestrator] Starting session for {student_id}")
        session_id = f"session_{uuid.uuid4().hex[:8]}"

        # Create session plan
        session_plan = self.session_planner.plan_session(
            student_profile=student_profile,
            current_goal=student_profile.get("current_goal"),
            available_time_minutes=available_time_minutes
        )

        # Determine starting concept
        if not initial_concept_id:
            initial_concept_id = self._determine_starting_concept(student_profile)
        
        # Initial content and lesson (pre-planned but used only if needed)
        student_level_int = self._get_student_level_score(student_profile)
        content_package = await self._request_content(
            concept_id=initial_concept_id,
            student_level=student_level_int
        )

        lesson = await self._request_lesson(
            content_package=content_package,
            student_context={
                "student_id": student_id,
                "student_level": student_level_int,
                "learning_style": student_profile.get("learning_style", {}).get("primary_modality", "visual")
            }
        )

        return {
            "session_id": session_id,
            "session_plan": session_plan,
            "current_activity": {
                "type": "teaching",
                "concept_id": initial_concept_id,
                "lesson": lesson
            },
            "status": "active"
        }

    async def get_initial_greeting(
        self,
        student_profile: Dict,
        session_id: str
    ) -> str:
        """Generate a warm, conversational opening greeting"""
        name = student_profile.get("name", "Student")
        mastery_count = self._get_student_level_score(student_profile)
        
        prompt = f"""
        Generate a warm, professional, yet high-energy greeting for {name}. 
        Progress Context: They have mastered {mastery_count} concepts.
        
        Your goal:
        1. Greet them as 'AI Orchestrator', their elite DSA master.
        2. Use **Markdown** (bolding, emojis) to make it look premium.
        3. Ask if they want to continue the roadmap or master a specific topic.
        
        Tone: Encouraging, concise, and mathematically elegant. Under 80 words.
        """
        
        system_prompt = "You are the AI Orchestrator, the world's most engaging and elite DSA Tutor. You are starting a new learning session."
        
        try:
            return await self.llm_service.generate_response(prompt, system_prompt, timeout=8.0)
        except Exception as e:
            logger.error(f"Greeting generation failed: {e}")
            return f"Hi {name}! 👋 Ready to learn something amazing today? We can dive into your curriculum or cover a topic of your choice!"

    async def process_student_response(
        self,
        session_id: str,
        student_id: str,
        response_data: Dict,
        session_state: Dict
    ) -> Dict:
        """Process student's response and decide next action"""
        logger.info(f"[{self.agent_name}] Processing response in session {session_id}")

        current_concept = session_state.get("current_concept_id")
        answer = response_data.get("answer", "")
        
        # 1. Handle Discovery/Chat Phase (If transition to teaching is requested)
        start_keywords = ["start", "begin", "learn", "master", "go to", "first topic", "dive in", "okay", "ok"]
        is_starting = any(kw in answer.lower() for kw in start_keywords) and not current_concept
        
        if is_starting:
            next_concept = self._determine_starting_concept(session_state.get("student_profile", {}))
            session_state["current_concept_id"] = next_concept
            
            # Use the decision engine approach to get content
            content_package = await self._request_content(
                concept_id=next_concept,
                student_level=self._get_student_level_score(session_state.get("student_profile", {}))
            )
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={
                    "student_id": student_id,
                    "student_level": self._get_student_level_score(session_state.get("student_profile", {}))
                }
            )
            
            return {
                "action": "advance",
                "reasoning": f"Student requested to start the learning journey. Beginning with: {next_concept}",
                "next_concept": next_concept,
                "lesson": lesson
            }

        # Handle general chat
        if not current_concept or response_data.get("interaction_type") == "chat":
            tutor_reply = await self.generate_tutor_response(
                user_message=answer,
                student_profile=session_state.get("student_profile", {}),
                session_history=session_state.get("interactions", [])[-5:]
            )
            return {
                "action": "chat_reply",
                "content": tutor_reply
            }

        # 2. Handle Assessment Phase
        if response_data.get("type") == "assessment_answer":
            evaluation = await self._evaluate_answer(
                question=session_state.get("current_question"),
                answer=answer
            )

            if "evaluations" not in session_state:
                session_state["evaluations"] = []
            session_state["evaluations"].append(evaluation)

            if len(session_state["evaluations"]) >= session_state.get("total_questions", 5):
                return await self._handle_assessment_complete(session_id, student_id, session_state)
            else:
                if "remaining_questions" in session_state and session_state["remaining_questions"]:
                    next_question = session_state["remaining_questions"].pop(0)
                    return {
                        "action": "ask_question",
                        "question": next_question
                    }
                else:
                    return await self._handle_assessment_complete(session_id, student_id, session_state)

        # 3. Handle Comprehension Phase
        elif response_data.get("type") == "comprehension_check":
            is_understanding = self._quick_comprehension_check(response_data)
            
            if not is_understanding:
                adapted_explanation = await self._adapt_teaching(
                    current_concept=current_concept,
                    student_feedback=answer,
                    context=session_state
                )
                
                return {
                    "action": "provide_clarification",
                    "content": adapted_explanation
                }
            else:
                return {
                    "action": "continue_teaching"
                }

        # Default: Treat as conversational chat
        tutor_reply = await self.generate_tutor_response(
            user_message=answer,
            student_profile=session_state.get("student_profile", {}),
            session_history=session_state.get("interactions", [])[-5:]
        )
        return {
            "action": "chat_reply",
            "content": tutor_reply
        }

    async def generate_tutor_response(
        self,
        user_message: str,
        student_profile: Dict,
        session_history: List[Dict]
    ) -> str:
        """Generate a conversational ChatGPT-like response from the tutor persona"""
        name = student_profile.get("name", "Student")
        msg_lower = user_message.lower()
        
        # Syllabus Command
        if any(cmd in msg_lower for cmd in ["syllabus", "curriculum", "what can you teach"]):
            syllabus_list = "\n".join([f"- **{topic}**" for topic in self.curriculum])
            return f"I'm specially designed to help you master **Data Structures and Algorithms**! 🚀\n\n### **Our Professional Roadmap**\n{syllabus_list}\n\nWhich one shall we tackle first, Kiddo?"

        # Mastery Command
        if any(cmd in msg_lower for cmd in ["master", "start with", "learn"]):
            for topic in self.curriculum:
                topic_core = topic.split("(")[0].strip().lower()
                if topic_core in msg_lower:
                    topic_display = topic.split('(')[0].strip()
                    return f"Excellent choice! Let's master **{topic_display}** together.\n\nI'll take you from the **absolute basics** (mental models) up to **advanced interview patterns**. \n\nReady to dive into the first concept? 🧠🔥"

        history_str = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in session_history])
        
        prompt = f"""
        Student ({name}) says: "{user_message}"
        
        Recent History:
        {history_str}
        
        Curriculum Context (22 Critical Domains):
        {", ".join(self.curriculum)}
        
        Role: AI Orchestrator, an elite DSA specialist and Master Tutor.
        
        Your Goal: 
        Generate a "Masterpiece" explanation. The student values depth and mathematical elegance, but wants the length to be controlled. 
        Aim for a response length of **350-400 words**.
        
        Execution Style:
        1. USE **BOLDING** for key technical terms, algorithmic complexities, and pivotal logical steps.
        2. Provide **Deep In-depth intuition** first. Explain the "Why" and the mental model with extreme clarity.
        3. Use professional **Markdown** (Headers, Tables, and Bullet Points) to structure content cleanly.
        4. Specialization: ONLY DSA. If asked about the "Roadmap", provide a clear, categorized breakdown of the 22 topics.
        5. Length: **350-400 words**. Be comprehensive but efficient. Don't be too long that it becomes boring, but don't be too short that it loses quality.
        6. Tone: Premium, witty, high-energy, and intellectually stimulating.
        
        If asked to "Master" a topic, explain the transition from **Foundational intuition** -> **Implementation patterns** -> **Edge cases**.
        
        Formatting Requirement: STRICT Markdown usage for readability.
        Response:
        """
        
        system_prompt = "You are the AI Orchestrator. You provide exhaustive, brilliant, and MASTERPIECE-level DSA explanations that are both deeply technical and incredibly engaging."
        
        try:
            return await self.llm_service.generate_response(prompt, system_prompt)
        except Exception as e:
            logger.error(f"Tutor chat generation failed: {e}")
            return "DSA is my jam! Let's get back to mastering those algorithms. What's on your mind?"

    async def _handle_assessment_complete(
        self,
        session_id: str,
        student_id: str,
        session_state: Dict
    ) -> Dict:
        """Handle completion of assessment and decide next action"""
        logger.info(f"[{self.agent_name}] Assessment complete, making strategic decision")

        assessment_results = {
            "session_id": session_id,
            "concept_id": session_state.get("current_concept_id"),
            "evaluations": session_state.get("evaluations", [])
        }

        analysis = await self._request_analysis(
            session_id=session_id,
            student_id=student_id,
            session_data={
                "assessment_results": [assessment_results],
                "interactions": session_state.get("interactions", []),
                "duration_minutes": session_state.get("elapsed_minutes", 0)
            }
        )

        decision = self.decision_engine.decide_next_action(
            current_state={
                "concept_id": session_state.get("current_concept_id"),
                "mastery_level": analysis.get("performance_analysis", {}).get("mastery_level", 0)
            },
            analyst_recommendations=analysis.get("recommendations", {}),
            student_profile=session_state.get("student_profile", {}),
            session_context={
                "fatigue_level": analysis.get("fatigue_analysis", {}).get("fatigue_level", "none"),
                "frustration_level": session_state.get("frustration_level", "low")
            }
        )

        return await self._execute_decision(decision, student_id, session_state)

    async def _emit(self, agent: str, message: str, meta: Dict) -> None:
        sink = getattr(self, "event_sink", None)
        if sink:
            try:
                await sink(agent, message, meta)
            except Exception:                       # observability must never break teaching
                logger.debug("event sink failed", exc_info=True)

    async def _execute_decision(
        self,
        decision: Dict,
        student_id: str,
        session_state: Dict
    ) -> Dict:
        """Execute the decision made by decision engine"""
        decision_type = decision["decision"]
        await self._emit("orchestrator", f"{decision_type.replace('_', ' ').title()}: {decision.get('reasoning', '')}",
                         {"decision": decision_type, "next_concept_id": decision.get("next_concept_id"),
                          "teaching_strategy": decision.get("teaching_strategy")})

        if decision_type == DecisionType.ADVANCE:
            next_concept_id = decision["next_concept_id"]
            content_package = await self._request_content(
                concept_id=next_concept_id,
                student_level=decision["parameters"].get("difficulty_level", 2)
            )
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={
                    "student_id": student_id,
                    "teaching_strategy": decision.get("teaching_strategy")
                }
            )
            return {
                "action": "advance",
                "reasoning": decision["reasoning"],
                "next_concept": next_concept_id,
                "lesson": lesson
            }
        elif decision_type == DecisionType.REVIEW:
            return {
                "action": "review",
                "reasoning": decision["reasoning"],
                "focus_areas": decision["parameters"].get("focus_on", "weak_areas")
            }
        elif decision_type == DecisionType.BREAK:
            return {
                "action": "suggest_break",
                "reasoning": decision["reasoning"],
                "break_duration_minutes": decision["parameters"].get("break_duration_minutes", 15)
            }
        elif decision_type == DecisionType.REMEDIATE:
            prereq_concept_id = decision["next_concept_id"]
            content_package = await self._request_content(
                concept_id=prereq_concept_id,
                student_level=1
            )
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={"student_id": student_id, "is_remediation": True}
            )
            return {
                "action": "remediate",
                "reasoning": decision["reasoning"],
                "prerequisite_concept": prereq_concept_id,
                "lesson": lesson
            }
        elif decision_type == DecisionType.SWITCH:
            return {
                "action": "switch",
                "reasoning": decision["reasoning"],
                "alternative_concept": decision["next_concept_id"]
            }
        else:
            return {"action": "continue"}

    async def _request_content(self, concept_id: str, student_level: int) -> Dict:
        """Request content from Knowledge Agent"""
        concept_str = str(concept_id)
        return {
            "concept_id": concept_str,
            "title": concept_str.replace("_", " ").replace("-", " ").title(),
            "content": {
                "explanation": f"Let's dive into {concept_str}.",
                "difficulty_context": self._level_to_string(student_level)
            }
        }

    async def _request_lesson(self, content_package: Dict, student_context: Dict) -> Dict:
        """Request lesson from Teaching Agent"""
        concept_title = content_package.get("title", "this topic")
        level_score = student_context.get("student_level", 0)
        level_str = self._level_to_string(level_score)
        
        prompt = f"""
        Create a brief DSA lesson about '{concept_title}'.
        Student Level: {level_str} ({level_score}/10).
        
        - level 0-2: Absolute basics.
        - higher level: Advanced patterns.
        """
        
        system_prompt = "You are Kiddoo, a brilliant DSA Tutor."
        try:
            lesson_text = await self.llm_service.generate_response(prompt, system_prompt)
            return {
                "lesson_content": lesson_text,
                "teaching_strategy": "Socratic",
                "concept_title": concept_title
            }
        except Exception as e:
            logger.error(f"Lesson generation failed: {e}")
            return {"lesson_content": f"Let's learn {concept_title}!", "teaching_strategy": "fallback"}

    async def _evaluate_answer(self, question: Dict, answer: str) -> Dict:
        """Request evaluation from Assessment Agent"""
        return {"is_correct": True, "score": 0.8, "feedback": "Good job!"}

    async def _request_analysis(self, session_id: str, student_id: str, session_data: Dict) -> Dict:
        """Request analysis from Analyst Agent"""
        message = {
            "message_id": f"msg_{uuid.uuid4().hex[:8]}",
            "correlation_id": session_id,
            "from_agent": self.agent_name,
            "to_agent": "analyst_agent",
            "action": "analyze_session",
            "payload": {"session_id": session_id, "student_id": student_id, "session_data": session_data}
        }
        await self.message_queue.publish("analyst.requests", message)
        return {"performance_analysis": {"mastery_level": 0.75}, "recommendations": {"primary_action": "advance"}}

    async def _adapt_teaching(self, current_concept: str, student_feedback: str, context: Dict) -> str:
        """Request adapted explanation from Teaching Agent"""
        return "Here's a simpler explanation..."

    def _determine_starting_concept(self, profile: Dict) -> str:
        """Determine where to start based on profile"""
        learning_path = profile.get("current_learning_path", [])
        return learning_path[0] if learning_path else "Foundations"

    def _get_student_level_score(self, profile: Dict) -> int:
        """Determine student's current level as a score (0-10)"""
        mastery = profile.get("concept_mastery", [])
        mastery_count = len([m for m in mastery if (isinstance(m, dict) and m.get("mastery_level", 0) >= 0.8)])
        return min(mastery_count, 10)

    def _level_to_string(self, level: int) -> str:
        """Convert numeric level to string"""
        if level <= 2: return "beginner"
        if level <= 4: return "intermediate"
        return "advanced"

    def _quick_comprehension_check(self, response: Dict) -> bool:
        """Quick check if student understood"""
        answer = response.get("answer", "").lower()
        return len(answer) > 10 and "don't understand" not in answer
