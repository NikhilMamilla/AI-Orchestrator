
from typing import Dict, List, Any, Optional
from collections import Counter
import logging

logger = logging.getLogger(__name__)

class MisconceptionDetector:
    """Detect and categorize student misconceptions"""

    def detect_misconceptions(self, assessment_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze assessment results to identify misconceptions
        
        Args:
            assessment_results: List of assessment evaluation results
        
        Returns:
            {
                "misconceptions": [
                    {
                        "type": str,
                        "description": str,
                        "frequency": int,
                        "severity": "high|medium|low",
                        "affected_concepts": [str]
                    }
                ],
                "root_cause_analysis": str
            }
        """
        misconception_map = {}

        # Collect all detected misconceptions
        for result in assessment_results:
            for evaluation in result.get("evaluations", []):
                inner_eval = evaluation.get("evaluation", {})
                misconception = inner_eval.get("misconception_detected", "")
                
                if misconception and misconception.lower() != "none":
                    concept_id = result.get("concept_id")
                    
                    if misconception not in misconception_map:
                        misconception_map[misconception] = {
                            "description": misconception,
                            "frequency": 0,
                            "affected_concepts": set()
                        }
                    
                    misconception_map[misconception]["frequency"] += 1
                    if concept_id:
                        misconception_map[misconception]["affected_concepts"].add(concept_id)

        # Categorize and prioritize
        misconceptions = []
        for desc, data in misconception_map.items():
            severity = self._determine_severity(data["frequency"], len(data["affected_concepts"]))
            misconception_type = self._categorize_misconception(desc)
            
            misconceptions.append({
                "type": misconception_type,
                "description": desc,
                "frequency": data["frequency"],
                "severity": severity,
                "affected_concepts": list(data["affected_concepts"])
            })

        # Sort by severity and frequency
        severity_rank = {"high": 3, "medium": 2, "low": 1}
        misconceptions.sort(key=lambda x: (
            severity_rank.get(x["severity"], 0),
            x["frequency"]
        ), reverse=True)

        # Root cause analysis
        root_cause = self._analyze_root_cause(misconceptions)

        return {
            "misconceptions": misconceptions,
            "root_cause_analysis": root_cause,
            "total_unique_misconceptions": len(misconceptions)
        }

    def detect_prerequisite_gaps(
        self,
        concept_id: str,
        performance_history: List[Dict[str, Any]],
        concept_graph: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Identify gaps in prerequisite knowledge
        
        Args:
            concept_id: Current concept being studied
            performance_history: Student's performance on related concepts
            concept_graph: Graph of concept dependencies
        
        Returns:
            {
                "has_gaps": bool,
                "gap_concepts": [str],
                "gap_severity": "high|medium|low",
                "recommended_review": [str]
            }
        """
        prerequisites = concept_graph.get(concept_id, {}).get("prerequisites", [])
        
        if not prerequisites:
            return {
                "has_gaps": False,
                "gap_concepts": [],
                "gap_severity": "none",
                "recommended_review": []
            }

        # Check mastery of prerequisites
        gaps = []
        for prereq_id in prerequisites:
            prereq_performance = self._get_concept_performance(prereq_id, performance_history)
            
            if prereq_performance["mastery_level"] < 0.6:
                gaps.append({
                    "concept_id": prereq_id,
                    "mastery_level": prereq_performance["mastery_level"],
                    "last_practiced": prereq_performance.get("last_practiced")
                })

        if not gaps:
            return {
                "has_gaps": False,
                "gap_concepts": [],
                "gap_severity": "none",
                "recommended_review": []
            }

        # Determine severity
        avg_gap_mastery = sum(g["mastery_level"] for g in gaps) / len(gaps)
        
        if avg_gap_mastery < 0.3:
            severity = "high"
        elif avg_gap_mastery < 0.5:
            severity = "medium"
        else:
            severity = "low"

        # Recommend review order (most foundational first)
        recommended_review = [g["concept_id"] for g in sorted(gaps, key=lambda x: x["mastery_level"])]

        return {
            "has_gaps": True,
            "gap_concepts": [g["concept_id"] for g in gaps],
            "gap_severity": severity,
            "recommended_review": recommended_review
        }

    def _determine_severity(self, frequency: int, concept_count: int) -> str:
        """Determine severity of misconception"""
        if frequency >= 3 or concept_count >= 2:
            return "high"
        elif frequency >= 2:
            return "medium"
        else:
            return "low"

    def _categorize_misconception(self, description: str) -> str:
        """Categorize type of misconception"""
        description_lower = description.lower()
        
        if any(word in description_lower for word in ["complexity", "time", "space", "o("]):
            return "complexity_analysis"
        elif any(word in description_lower for word in ["syntax", "code", "implementation"]):
            return "implementation"
        elif any(word in description_lower for word in ["concept", "definition", "understanding"]):
            return "conceptual"
        elif any(word in description_lower for word in ["when", "use", "apply"]):
            return "application"
        else:
            return "general"

    def _analyze_root_cause(self, misconceptions: List[Dict[str, Any]]) -> str:
        """Analyze root cause of misconceptions"""
        if not misconceptions:
            return "No misconceptions detected"

        # Count misconception types
        type_counter = Counter(m["type"] for m in misconceptions)
        most_common_type = type_counter.most_common(1)[0][0]

        # Generate root cause analysis
        root_causes = {
            "complexity_analysis": "Student struggles with analyzing algorithmic complexity and Big O notation",
            "implementation": "Student has difficulty translating concepts into working code",
            "conceptual": "Student has gaps in fundamental understanding of core concepts",
            "application": "Student doesn't know when to apply specific concepts to problems",
            "general": "Student shows scattered confusion across multiple areas"
        }

        return root_causes.get(most_common_type, "Multiple areas need attention")

    def _get_concept_performance(self, concept_id: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get performance data for a specific concept"""
        for item in history:
            if item.get("concept_id") == concept_id:
                return item
        
        return {
            "mastery_level": 0.0,
            "last_practiced": None
        }
