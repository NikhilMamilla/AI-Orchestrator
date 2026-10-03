
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import re

from backend.app.agents.analyst.pattern_detector import PatternDetector
from backend.app.agents.analyst.misconception_detector import MisconceptionDetector
from backend.app.services.student_profile_service import StudentProfileService
from backend.app.services.llm import LLMService

logger = logging.getLogger(__name__)

class AnalystAgent:
    """
    Behavioral Analyst Agent
    
    Responsibilities:
    - Detect learning patterns and trends
    - Identify misconceptions and knowledge gaps
    - Build psychological learner profile
    - Provide predictive insights
    - Generate recommendations for Orchestrator
    """

    def __init__(
        self,
        llm_service: LLMService,
        student_profile_service: StudentProfileService
    ):
        self.llm_service = llm_service
        self.student_profile_service = student_profile_service
        self.pattern_detector = PatternDetector()
        self.misconception_detector = MisconceptionDetector()
        self.agent_name = "analyst_agent"

    async def analyze_session(
        self,
        session_id: str,
        session_data: Dict[str, Any],
        student_id: str
    ) -> Dict[str, Any]:
        """
        Analyze a completed learning session
        """
        logger.info(f"[{self.agent_name}] Analyzing session: {session_id}")

        # Get student profile
        profile = await self.student_profile_service.get_profile_by_user_id(student_id)
        
        # Extract session components
        assessment_results = session_data.get("assessment_results", [])
        interactions = session_data.get("interactions", [])
        
        # Perform analyses
        performance_analysis = self._analyze_performance(assessment_results)
        engagement_analysis = self._analyze_engagement(interactions)
        misconception_analysis = self.misconception_detector.detect_misconceptions(assessment_results)
        fatigue_analysis = self.pattern_detector.detect_fatigue(session_data)

        # Generate insights using LLM
        insights = await self._generate_insights(
            performance_analysis,
            engagement_analysis,
            misconception_analysis,
            fatigue_analysis,
            profile
        )

        # Determine recommendations
        recommendations = self._generate_recommendations(
            performance_analysis,
            misconception_analysis,
            fatigue_analysis
        )

        # Update student profile
        profile_updates = self._prepare_profile_updates(
            performance_analysis,
            engagement_analysis,
            misconception_analysis,
            profile
        )

        analysis = {
            "session_id": session_id,
            "student_id": student_id,
            "analysis_timestamp": datetime.utcnow().isoformat(),
            
            "performance_analysis": performance_analysis,
            "engagement_analysis": engagement_analysis,
            "misconception_analysis": misconception_analysis,
            "fatigue_analysis": fatigue_analysis,
            
            "insights": insights,
            "recommendations": recommendations,
            "profile_updates": profile_updates,
            
            "metadata": {
                "agent": self.agent_name
            }
        }

        logger.info(f"[{self.agent_name}] Analysis complete. Primary recommendation: {recommendations['primary_action']}")
        
        return analysis

    async def predict_performance(
        self,
        student_id: str,
        concept_id: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Predict how student will perform on a concept
        """
        profile = await self.student_profile_service.get_profile_by_user_id(student_id)
        if not profile:
            return {"error": "Student profile not found", "predicted_mastery": 0.5, "confidence": 0.0}
            
        # Get historical performance (simplified for now)
        past_performance = self._get_related_performance(profile, concept_id, context)
        
        # Use LLM to predict
        logger.info(f"[{self.agent_name}] Generating performance prediction for concept: {concept_id}")
        prompt = f"""Analyze this student's learning profile and predict their performance on a new concept.
...
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a senior behavioral analyst. Always output valid JSON with the exact keys: 'predicted_mastery', 'confidence', 'factors', 'estimated_time_minutes', 'reasoning'."
        )
        logger.info(f"[{self.agent_name}] Performance prediction received from LLM: {response_text[:100]}...")

        try:
            # Extract JSON from potential markdown blocks
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                prediction = json.loads(json_match.group(1))
            else:
                json_match = re.search(r'({.*})', response_text, re.DOTALL)
                if json_match:
                    prediction = json.loads(json_match.group(1))
                else:
                    prediction = json.loads(response_text)
            
            # Map common alternative keys if necessary
            if "predicted_mastery" not in prediction and "likely_mastery" in prediction:
                prediction["predicted_mastery"] = prediction["likely_mastery"]
            if "predicted_mastery" not in prediction and "mastery_level" in prediction:
                prediction["predicted_mastery"] = prediction["mastery_level"]
                
            return prediction
        except Exception as e:
            logger.error(f"Failed to parse prediction JSON: {e}")
            return {
                "predicted_mastery": 0.5,
                "confidence": 0.3,
                "reasoning": "Error predicting performance",
                "factors": []
            }

    async def analyze_long_term_progress(
        self,
        student_id: str,
        sessions: List[Dict[str, Any]] = None,
        time_period_days: int = 30
    ) -> Dict[str, Any]:
        """
        Analyze student's progress over time
        """
        profile = await self.student_profile_service.get_profile_by_user_id(student_id)
        if not profile:
            return {"error": "Student profile not found"}
            
        if not sessions:
            # Fetch sessions from the database
            sessions = await self.student_profile_service.recent_sessions(student_id, limit=100)

            if not sessions:
                logger.warning(f"[{self.agent_name}] No session history found in DB for student {student_id}.")
            else:
                logger.info(f"[{self.agent_name}] Fetched {len(sessions)} sessions for longitudinal analysis.")
        
        velocity_analysis = self.pattern_detector.detect_learning_velocity(sessions)
        optimal_times = self.pattern_detector.detect_optimal_learning_times(sessions)
        
        # Detect plateaus
        mastery_history = [
            {
                "concept_id": str(m.concept_id),
                "mastery_level": m.mastery_level,
                "timestamp": m.last_practiced
            }
            for m in profile.concept_mastery
        ]
        plateau_analysis = self.pattern_detector.detect_plateau(mastery_history)

        return {
            "student_id": student_id,
            "analysis_period_days": time_period_days,
            "velocity_analysis": velocity_analysis,
            "optimal_learning_times": optimal_times,
            "plateau_analysis": plateau_analysis,
            "overall_progress": {
                "concepts_mastered": profile.overall_stats.concepts_mastered,
                "total_time_invested": profile.overall_stats.total_time_minutes,
                "current_streak": profile.overall_stats.current_streak
            }
        }

    def _analyze_performance(self, assessment_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze assessment performance"""
        if not assessment_results:
            return {
                "average_score": 0.0,
                "mastery_level": 0.0,
                "performance_trend": "unknown"
            }

        scores = [r.get("summary", {}).get("average_score", 0) for r in assessment_results]
        avg_score = sum(scores) / len(scores)

        return {
            "average_score": avg_score,
            "mastery_level": avg_score,
            "total_assessments": len(assessment_results),
            "performance_trend": "improving" if len(scores) > 1 and scores[-1] > scores[0] else "stable"
        }

    def _analyze_engagement(self, interactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze student engagement"""
        if not interactions:
            return {
                "engagement_level": "unknown",
                "total_interactions": 0
            }

        # Calculate engagement metrics
        avg_response_time = sum(i.get("response_time_seconds", 0) for i in interactions) / len(interactions)
        questions_asked = sum(1 for i in interactions if i.get("interaction_type") == "question")
        
        # Determine engagement level
        if questions_asked >= 3 and avg_response_time < 120:
            engagement_level = "high"
        elif questions_asked >= 1 or avg_response_time < 180:
            engagement_level = "medium"
        else:
            engagement_level = "low"

        return {
            "engagement_level": engagement_level,
            "total_interactions": len(interactions),
            "questions_asked": questions_asked,
            "average_response_time": avg_response_time
        }

    async def _generate_insights(
        self,
        performance: Dict[str, Any],
        engagement: Dict[str, Any],
        misconceptions: Dict[str, Any],
        fatigue: Dict[str, Any],
        profile: any
    ) -> str:
        """Generate human-readable insights using LLM"""
        
        style = profile.learning_style.primary_modality if profile else "unknown"
        
        prompt = f"""Analyze this student's learning session and provide 3-4 key insights.

Performance: {performance.get('mastery_level', 0):.0%} mastery
Engagement: {engagement.get('engagement_level', 'unknown')}
Misconceptions detected: {len(misconceptions.get('misconceptions', []))}
Fatigue level: {fatigue.get('fatigue_level', 'none')}
Learning style: {style}

Provide concise, actionable insights. Focus on what's working, what needs attention, and specific recommendations.

Format as bullet points:
- Insight 1
- Insight 2
- Insight 3"""

        return await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a supportive and professional learning analyst."
        )

    def _generate_recommendations(
        self,
        performance: Dict[str, Any],
        misconceptions: Dict[str, Any],
        fatigue: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate actionable recommendations"""
        
        recommendations = []
        primary_action = None

        # Check fatigue first (highest priority)
        if fatigue.get("is_fatigued"):
            primary_action = "suggest_break"
            recommendations.append({
                "action": "suggest_break",
                "reason": f"Student showing {fatigue['fatigue_level']} fatigue",
                "priority": "high"
            })

        # Check performance
        mastery = performance.get("mastery_level", 0)
        if mastery >= 0.8:
            if not primary_action:
                primary_action = "advance"
            recommendations.append({
                "action": "advance",
                "reason": "High mastery achieved",
                "priority": "medium"
            })
        elif mastery >= 0.6:
            if not primary_action:
                primary_action = "practice"
            recommendations.append({
                "action": "practice",
                "reason": "Partial mastery - more practice needed",
                "priority": "medium"
            })
        else:
            if not primary_action:
                primary_action = "review"
            recommendations.append({
                "action": "review",
                "reason": "Low mastery - review with different strategy",
                "priority": "high"
            })

        # Check misconceptions
        if misconceptions.get("misconceptions"):
            high_severity = [m for m in misconceptions["misconceptions"] if m["severity"] == "high"]
            if high_severity and not primary_action:
                primary_action = "address_misconception"
                recommendations.append({
                    "action": "address_misconception",
                    "reason": f"Critical misconception: {high_severity[0]['description']}",
                    "priority": "high"
                })

        return {
            "primary_action": primary_action or "continue",
            "all_recommendations": recommendations
        }

    def _prepare_profile_updates(
        self,
        performance: Dict[str, Any],
        engagement: Dict[str, Any],
        misconceptions: Dict[str, Any],
        profile: any
    ) -> Dict[str, Any]:
        """Prepare updates to student profile"""
        
        updates = {}
        # Update patterns
        updates["patterns"] = {
            "recent_performance_trend": performance.get("performance_trend", "stable"),
            "engagement_level": engagement.get("engagement_level", "medium"),
            "misconceptions_count": len(misconceptions.get("misconceptions", []))
        }

        return updates

    def _get_related_performance(self, profile: any, concept_id: str, context: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Get performance on related concepts"""
        # Simplified: Filter by context if provided
        return []

    def _format_past_performance(self, performance: List[Dict[str, Any]]) -> str:
        """Format past performance for LLM prompt"""
        if not performance:
            return "No relevant past performance data"
        
        return "\n".join([
            f"- {p.get('concept', 'Unknown')}: {p.get('mastery', 0):.0%} mastery"
            for p in performance
        ])
