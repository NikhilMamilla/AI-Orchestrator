
from typing import Dict, Optional, List, Any
from datetime import datetime
from backend.app.agents.teaching.strategies import TeachingStrategies
from backend.app.services.llm import LLMService
import logging

logger = logging.getLogger(__name__)

class TeachingAgent:
    """
    Adaptive Pedagogy Agent
    
    Responsibilities:
    - Select appropriate teaching strategy
    - Generate lessons adapted to student
    - Monitor comprehension signals
    - Switch strategies if needed
    """

    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service
        self.strategies = TeachingStrategies(llm_service)
        self.agent_name = "teaching_agent"

    async def teach_concept(
        self,
        content_package: Dict[str, Any],
        student_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Main entry point: Generate a lesson for the concept
        
        Args:
            content_package: From Knowledge Agent
            student_context: Student profile and session context
        
        Returns:
            Lesson content with teaching strategy applied
        """
        logger.info(f"[{self.agent_name}] Teaching: {content_package['title']}")

        # Step 1: Select teaching strategy
        strategy_name = self._select_strategy(content_package, student_context)
        logger.info(f"[{self.agent_name}] Selected strategy: {strategy_name}")

        # Step 2: Apply strategy
        lesson_content = await self._apply_strategy(
            strategy_name=strategy_name,
            content=content_package,
            context=student_context
        )

        # Step 3: Add comprehension checks
        lesson_content = await self._add_comprehension_checks(
            lesson_content,
            content_package,
            student_context
        )

        # Step 4: Build complete lesson
        lesson = {
            "concept_id": content_package.get("concept_id"),
            "concept_title": content_package["title"],
            "teaching_strategy": strategy_name,
            "lesson_content": lesson_content,
            "estimated_duration_minutes": content_package.get("estimated_time_minutes", 30),
            "prerequisites": content_package.get("prerequisites", []),
            "next_steps": self._suggest_next_steps(content_package),
            "metadata": {
                "agent": self.agent_name,
                "timestamp": datetime.now().isoformat()
            }
        }

        return lesson

    def _select_strategy(self, content: Dict[str, Any], context: Dict[str, Any]) -> str:
        """
        Select the most appropriate teaching strategy
        
        Decision logic based on:
        - Student level
        - Learning style
        - Previous strategy effectiveness
        - Concept complexity
        """
        student_level = context.get("student_level", "beginner")
        learning_style = context.get("learning_style", "visual")
        previous_strategy = context.get("previous_strategy")
        previous_success = context.get("previous_strategy_success", True)

        # If previous strategy failed, try different approach
        if previous_strategy and not previous_success:
            strategies = ["socratic", "worked_example", "analogy", "incremental", "visual"]
            if previous_strategy in strategies:
                strategies.remove(previous_strategy)
            return strategies[0]  # Try first alternative

        # Match strategy to learning style
        if learning_style == "visual":
            return "visual"
        elif learning_style == "kinesthetic":
            return "worked_example"  # Hands-on
        elif learning_style == "reading":
            return "incremental"

        # Default by student level
        if student_level == "beginner":
            return "analogy"  # Analogies work well for beginners
        elif student_level == "intermediate":
            return "worked_example"
        else:
            return "incremental"

    async def _apply_strategy(self, strategy_name: str, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Apply the selected teaching strategy"""
        strategy_map = {
            "socratic": self.strategies.socratic_method,
            "worked_example": self.strategies.worked_example,
            "analogy": self.strategies.analogy_based,
            "incremental": self.strategies.incremental_complexity,
            "visual": self.strategies.visual_teaching
        }

        strategy_func = strategy_map.get(strategy_name, self.strategies.worked_example)
        return await strategy_func(content, context)

    async def _add_comprehension_checks(
        self,
        lesson_content: Dict[str, Any],
        content_package: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Add embedded comprehension check questions throughout the lesson
        """
        prompt = f"""Based on this lesson content about "{content_package['title']}":

{lesson_content['content']}

Generate 2-3 quick comprehension check questions that:
1. Test understanding of key points
2. Are appropriate for {context.get('student_level', 'beginner')} level
3. Can be answered briefly (1-2 sentences or multiple choice)

Format as:
Q1: [question]
Expected answer: [brief answer]

Q2: [question]
Expected answer: [brief answer]"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are an expert pedagogical auditor. Create clear, effective comprehension checks."
        )

        lesson_content["comprehension_checks"] = response_text
        return lesson_content

    def _suggest_next_steps(self, content_package: Dict[str, Any]) -> List[str]:
        """Suggest what student should do next"""
        next_steps = [
            f"Practice with problems on {content_package['title']}",
            "Review the code examples and try implementing them yourself"
        ]

        # Add related concepts
        if content_package.get("related_concepts"):
            next_steps.append("Explore related concepts to deepen understanding")

        return next_steps

    async def adapt_explanation(
        self,
        original_explanation: str,
        student_feedback: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Adapt explanation based on student feedback
        
        Used when student says "I don't understand" or seems confused
        """
        prompt = f"""Original explanation:
{original_explanation}

Student feedback: "{student_feedback}"

The student is confused. Provide a different, simpler explanation that addresses their confusion.

Student level: {context.get('student_level', 'beginner')}
Learning style: {context.get('learning_style', 'visual')}

Provide a clearer explanation."""

        return await self.llm_service.generate_response(prompt)
