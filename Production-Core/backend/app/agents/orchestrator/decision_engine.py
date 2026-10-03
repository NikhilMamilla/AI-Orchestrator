
from typing import Dict, List, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class DecisionType(Enum):
    ADVANCE = "advance"
    DEEPEN = "deepen"
    REVIEW = "review"
    REMEDIATE = "remediate"
    SWITCH = "switch"
    BREAK = "break"

class DecisionEngine:
    """Core decision-making logic for the Orchestrator"""

    def __init__(self):
        self.decision_history = []

    def decide_next_action(
        self,
        current_state: Dict,
        analyst_recommendations: Dict,
        student_profile: Dict,
        session_context: Dict
    ) -> Dict:
        """
        Primary decision: What should happen next in the learning journey?
        
        Args:
            current_state: Current concept, mastery level, progress
            analyst_recommendations: From Analyst Agent
            student_profile: Student's complete profile
            session_context: Current session data
        
        Returns:
            {
                "decision": DecisionType,
                "reasoning": str,
                "next_concept_id": str (if applicable),
                "teaching_strategy": str (if applicable),
                "parameters": Dict
            }
        """
        logger.info("[DecisionEngine] Evaluating next action...")

        # Priority 1: Check for critical issues
        critical_decision = self._check_critical_issues(
            analyst_recommendations,
            session_context
        )
        if critical_decision:
            return critical_decision

        # Priority 2: Check mastery level
        current_mastery = current_state.get("mastery_level", 0.0)
        concept_id = current_state.get("concept_id")

        # Decision logic based on mastery
        if current_mastery >= 0.80:
            # High mastery - ready to advance
            prerequisites_met = self._check_prerequisites_for_next(
                concept_id,
                student_profile
            )
            
            if prerequisites_met:
                return self._decide_advance(current_state, student_profile)
            else:
                return self._decide_remediate(current_state, student_profile)

        elif 0.60 <= current_mastery < 0.80:
            # Partial mastery
            frustration_level = session_context.get("frustration_level", "low")
            
            if frustration_level == "high":
                return self._decide_switch(current_state, student_profile)
            else:
                return self._decide_deepen(current_state, student_profile)

        elif 0.40 <= current_mastery < 0.60:
            # Struggling but making some progress
            teaching_effectiveness = analyst_recommendations.get("teaching_effectiveness", "medium")
            
            if teaching_effectiveness == "low":
                return self._decide_review_with_new_strategy(current_state, student_profile)
            else:
                return self._decide_deepen(current_state, student_profile)

        else:
            # Low mastery (<40%)
            prerequisite_gaps = analyst_recommendations.get("prerequisite_gaps", {})
            
            if prerequisite_gaps.get("has_gaps", False):
                return self._decide_remediate(current_state, student_profile)
            else:
                return self._decide_review_with_new_strategy(current_state, student_profile)

    def _check_critical_issues(
        self,
        analyst_recommendations: Dict,
        session_context: Dict
    ) -> Optional[Dict]:
        """Check for issues that override normal decision logic"""
        
        # Check fatigue
        fatigue_level = session_context.get("fatigue_level", "none")
        if fatigue_level in ["severe", "moderate"]:
            return {
                "decision": DecisionType.BREAK,
                "reasoning": f"Student showing {fatigue_level} fatigue. Break recommended.",
                "parameters": {
                    "break_duration_minutes": 15 if fatigue_level == "moderate" else 30
                }
            }

        # Check for critical misconceptions
        primary_action = analyst_recommendations.get("primary_action")
        if primary_action == "address_misconception":
            misconception = analyst_recommendations.get("critical_misconception", "")
            return {
                "decision": DecisionType.REVIEW,
                "reasoning": f"Critical misconception detected: {misconception}",
                "parameters": {
                    "focus_area": "misconception_clarification",
                    "misconception": misconception
                }
            }

        return None

    def _decide_advance(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Move to next concept"""
        next_concept = self._select_next_concept(
            current_concept_id=current_state["concept_id"],
            profile=profile
        )

        return {
            "decision": DecisionType.ADVANCE,
            "reasoning": f"Mastery achieved ({current_state.get('mastery_level', 0):.0%}). Ready for next concept.",
            "next_concept_id": next_concept["concept_id"],
            "teaching_strategy": self._recommend_teaching_strategy(next_concept, profile),
            "parameters": {
                "difficulty_level": next_concept["difficulty"],
                "estimated_time": next_concept["estimated_time_minutes"]
            }
        }

    def _decide_deepen(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Continue with current concept, increase complexity"""
        return {
            "decision": DecisionType.DEEPEN,
            "reasoning": f"Partial mastery ({current_state.get('mastery_level', 0):.0%}). Increase difficulty.",
            "next_concept_id": current_state["concept_id"],
            "teaching_strategy": "incremental_complexity",
            "parameters": {
                "increase_difficulty": True,
                "focus_on": "advanced_applications"
            }
        }

    def _decide_review(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Review current concept with same strategy"""
        return {
            "decision": DecisionType.REVIEW,
            "reasoning": "Need more practice on current concept.",
            "next_concept_id": current_state["concept_id"],
            "teaching_strategy": current_state.get("teaching_strategy", "worked_example"),
            "parameters": {
                "focus_on": "weak_areas"
            }
        }

    def _decide_review_with_new_strategy(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Review with different teaching approach"""
        current_strategy = current_state.get("teaching_strategy", "worked_example")
        new_strategy = self._select_alternative_strategy(current_strategy, profile)

        return {
            "decision": DecisionType.REVIEW,
            "reasoning": f"Current teaching strategy not effective. Trying {new_strategy}.",
            "next_concept_id": current_state["concept_id"],
            "teaching_strategy": new_strategy,
            "parameters": {
                "strategy_change": True,
                "previous_strategy": current_strategy
            }
        }

    def _decide_remediate(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Address prerequisite gaps"""
        # Find weakest prerequisite
        weak_prereq = self._find_weakest_prerequisite(
            current_state["concept_id"],
            profile
        )

        return {
            "decision": DecisionType.REMEDIATE,
            "reasoning": f"Prerequisite gap detected. Reviewing {weak_prereq['title']}.",
            "next_concept_id": weak_prereq["concept_id"],
            "teaching_strategy": "scaffolded_review",
            "parameters": {
                "is_remediation": True,
                "return_to_concept": current_state["concept_id"]
            }
        }

    def _decide_switch(self, current_state: Dict, profile: Dict) -> Dict:
        """Decision: Switch to different concept temporarily"""
        alternative_concept = self._select_alternative_concept(
            current_state["concept_id"],
            profile
        )

        return {
            "decision": DecisionType.SWITCH,
            "reasoning": "Student frustrated. Switching to maintain engagement.",
            "next_concept_id": alternative_concept["concept_id"],
            "teaching_strategy": "engaging",
            "parameters": {
                "temporary_switch": True,
                "return_to_concept": current_state["concept_id"]
            }
        }

    def _check_prerequisites_for_next(self, concept_id: str, profile: Dict) -> bool:
        """Check if prerequisites for next concept are met"""
        # Would query concept graph for prerequisites
        # For now, return True
        return True

    def _select_next_concept(self, current_concept_id: str, profile: Dict) -> Dict:
        """Select the next concept in learning path"""
        # Would use knowledge graph and student's learning path
        # For now, return placeholder
        return {
            "concept_id": "next_concept",
            "title": "Next Concept",
            "difficulty": 2,
            "estimated_time_minutes": 30
        }

    def _recommend_teaching_strategy(self, concept: Dict, profile: Dict) -> str:
        """Recommend teaching strategy for concept"""
        learning_style = profile.get("learning_style", {}).get("primary_modality", "visual")
        difficulty = concept.get("difficulty", 2)

        # Match strategy to learning style and difficulty
        if learning_style == "visual":
            return "visual_teaching"
        elif learning_style == "kinesthetic":
            return "worked_example"
        elif difficulty >= 4:
            return "incremental_complexity"
        else:
            return "analogy_based"

    def _select_alternative_strategy(self, current_strategy: str, profile: Dict) -> str:
        """Select different teaching strategy"""
        strategies = ["socratic", "worked_example", "analogy", "incremental", "visual"]
        
        if current_strategy in strategies:
            strategies.remove(current_strategy)
        
        # Prefer strategy matching learning style
        learning_style = profile.get("learning_style", {}).get("primary_modality")
        
        if learning_style == "visual" and "visual" in strategies:
            return "visual"
        
        return strategies[0]

    def _find_weakest_prerequisite(self, concept_id: str, profile: Dict) -> Dict:
        """Find the weakest prerequisite concept"""
        # Would query prerequisites and check mastery
        return {
            "concept_id": "prerequisite_concept",
            "title": "Prerequisite Concept"
        }

    def _select_alternative_concept(self, concept_id: str, profile: Dict) -> Dict:
        """Select alternative concept for engagement"""
        # Would select related but easier/more interesting concept
        return {
            "concept_id": "alternative_concept",
            "title": "Alternative Concept"
        }
