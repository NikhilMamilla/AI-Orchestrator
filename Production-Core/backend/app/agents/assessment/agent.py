
from typing import Dict, List, Optional, Any
from backend.app.agents.assessment.question_generator import QuestionGenerator
from backend.app.agents.assessment.evaluator import AnswerEvaluator
from backend.app.services.llm import LLMService
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class AssessmentAgent:
    """
    Comprehensive Evaluator Agent
    
    Responsibilities:
    - Generate diverse question types
    - Evaluate answers with deep analysis
    - Detect misconceptions
    - Provide actionable feedback
    - Track performance metrics
    """

    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service
        self.question_generator = QuestionGenerator(llm_service)
        self.answer_evaluator = AnswerEvaluator(llm_service)
        self.agent_name = "assessment_agent"

    async def generate_assessment(
        self,
        concept: Dict[str, Any],
        student_context: Dict[str, Any],
        assessment_type: str = "comprehensive"
    ) -> Dict[str, Any]:
        """
        Generate assessment for a concept
        
        Args:
            concept: Concept content package
            student_context: Student profile and session info
            assessment_type: "quick_check", "comprehensive", "diagnostic"
        
        Returns:
            Assessment with questions
        """
        logger.info(f"[{self.agent_name}] Generating {assessment_type} assessment for: {concept.get('title', 'Unknown')}")

        # Determine question count and types based on assessment type
        if assessment_type == "quick_check":
            question_count = 3
            question_types = ["mcq", "explanation"]
        elif assessment_type == "diagnostic":
            question_count = 7
            question_types = ["mcq", "explanation", "application", "code", "debugging"]
        else:  # comprehensive
            question_count = 5
            question_types = ["mcq", "explanation", "application", "code"]

        # Adjust difficulty based on student level
        difficulty = self._determine_difficulty(student_context)

        # Generate questions
        questions = await self.question_generator.generate_questions(
            concept=concept,
            question_count=question_count,
            difficulty_level=difficulty,
            question_types=question_types
        )

        # Create assessment
        assessment = {
            "assessment_id": f"assess_{concept.get('concept_id', 'unknown')}_{int(datetime.utcnow().timestamp())}",
            "concept_id": concept.get("concept_id", "unknown"),
            "concept_title": concept.get("title", "Unknown"),
            "assessment_type": assessment_type,
            "questions": questions,
            "total_questions": len(questions),
            "difficulty_level": difficulty,
            "estimated_time_minutes": len(questions) * 3,  # 3 min per question
            "metadata": {
                "agent": self.agent_name,
                "generated_at": datetime.utcnow().isoformat()
            }
        }

        logger.info(f"[{self.agent_name}] Generated {len(questions)} questions")
        return assessment

    async def evaluate_assessment(
        self,
        assessment: Dict[str, Any],
        student_answers: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate completed assessment
        
        Args:
            assessment: Original assessment
            student_answers: List of {question_id, answer, time_taken_seconds}
            context: Additional context
        
        Returns:
            Evaluation results with analysis
        """
        logger.info(f"[{self.agent_name}] Evaluating assessment: {assessment.get('assessment_id')}")

        evaluations = []
        total_score = 0.0
        total_time = 0

        # Evaluate each answer
        for answer_data in student_answers:
            question = self._find_question(assessment["questions"], answer_data["question_id"])
            if not question:
                continue

            evaluation = await self.answer_evaluator.evaluate_answer(
                question=question,
                student_answer=answer_data["answer"],
                context=context
            )

            evaluations.append({
                "question_id": answer_data["question_id"],
                "question_type": question["question_type"],
                "student_answer": answer_data["answer"],
                "evaluation": evaluation,
                "time_taken_seconds": answer_data.get("time_taken_seconds", 0)
            })

            total_score += evaluation["score"]
            total_time += answer_data.get("time_taken_seconds", 0)

        # Calculate overall metrics
        avg_score = total_score / len(evaluations) if evaluations else 0.0

        # Analyze results
        analysis = await self._analyze_performance(evaluations, assessment, context)

        results = {
            "assessment_id": assessment.get("assessment_id"),
            "concept_id": assessment.get("concept_id"),
            "evaluations": evaluations,
            "summary": {
                "total_questions": len(evaluations),
                "correct_count": sum(1 for e in evaluations if e["evaluation"]["is_correct"]),
                "average_score": avg_score,
                "mastery_level": avg_score,  # 0-1 scale
                "total_time_seconds": total_time,
                "avg_time_per_question": total_time / len(evaluations) if evaluations else 0
            },
            "analysis": analysis,
            "metadata": {
                "agent": self.agent_name,
                "evaluated_at": datetime.utcnow().isoformat()
            }
        }

        logger.info(f"[{self.agent_name}] Assessment evaluated. Mastery: {avg_score:.2%}")
        return results

    def _determine_difficulty(self, student_context: Dict[str, Any]) -> int:
        """Determine appropriate difficulty level"""
        student_level = student_context.get("student_level", "beginner")
        mastery = student_context.get("current_mastery", 0.0)

        if student_level == "beginner" or mastery < 0.3:
            return 2
        elif student_level == "intermediate" or mastery < 0.7:
            return 3
        else:
            return 4

    def _find_question(self, questions: List[Dict[str, Any]], question_id: str) -> Optional[Dict[str, Any]]:
        """Find question by ID"""
        for q in questions:
            if q["question_id"] == question_id:
                return q
        return None

    async def _analyze_performance(
        self,
        evaluations: List[Dict[str, Any]],
        assessment: Dict[str, Any],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Deep analysis of assessment performance
        
        Identifies:
        - Strengths and weaknesses
        - Misconceptions
        - Recommended next actions
        """
        # Collect misconceptions
        misconceptions = []
        for e in evaluations:
            m = e["evaluation"].get("misconception_detected")
            if m and m.lower() != "none" and m.strip():
                misconceptions.append(m)

        # Collect what student knows vs missing
        knows = []
        missing = []
        for e in evaluations:
            knows.extend(e["evaluation"].get("what_student_knows", []))
            missing.extend(e["evaluation"].get("what_student_missing", []))

        # Analyze by question type
        performance_by_type = {}
        for e in evaluations:
            q_type = e["question_type"]
            if q_type not in performance_by_type:
                performance_by_type[q_type] = {"count": 0, "correct": 0, "total_score": 0.0}
            
            performance_by_type[q_type]["count"] += 1
            performance_by_type[q_type]["total_score"] += e["evaluation"]["score"]
            if e["evaluation"]["is_correct"]:
                performance_by_type[q_type]["correct"] += 1

        # Calculate averages
        for q_type in performance_by_type:
            count = performance_by_type[q_type]["count"]
            performance_by_type[q_type]["avg_score"] = performance_by_type[q_type]["total_score"] / count

        # Determine recommendations
        avg_score = sum(e["evaluation"]["score"] for e in evaluations) / len(evaluations) if evaluations else 0.0
        
        if avg_score >= 0.8:
            recommendation = "advance"
            action = "Student demonstrates mastery. Ready for next concept."
        elif avg_score >= 0.6:
            recommendation = "practice"
            action = "Student shows partial understanding. More practice recommended."
        elif avg_score >= 0.4:
            recommendation = "review"
            action = "Student struggling. Review concept with different teaching strategy."
        else:
            recommendation = "prerequisite_check"
            action = "Student may have gaps in prerequisites. Check foundational knowledge."

        return {
            "strengths": list(set(filter(None, knows)))[:5],  # Top 5 unique strengths
            "weaknesses": list(set(filter(None, missing)))[:5],  # Top 5 unique weaknesses
            "misconceptions_detected": list(set(filter(None, misconceptions))),
            "performance_by_type": performance_by_type,
            "recommendation": recommendation,
            "recommended_action": action,
            "confidence": "high" if len(evaluations) >= 5 else "medium" if len(evaluations) >= 3 else "low"
        }
