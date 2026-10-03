
from typing import Dict, List, Optional, Any
from backend.app.services.llm import LLMService
import logging

logger = logging.getLogger(__name__)

class TeachingStrategies:
    """
    Collection of teaching strategies that can be applied to content delivery.
    Adapted for Kiddoo's adaptive pedagogy engine.
    """

    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service

    async def socratic_method(self, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Socratic questioning: Guide student through discovery.
        """
        prompt = f"""You are a Socratic teacher. Your goal is to help the student discover the concept of "{content['title']}" through guided questions.

Content to teach:
{content['content']['definition']}

{content['content']['explanation']}

Student context:
- Level: {context.get('student_level', 'beginner')}
- Previous concepts: {context.get('previous_concepts', [])}

Create a series of 3-4 questions that will guide the student to understand this concept. Each question should:
1. Build on the previous question
2. Be answerable with their current knowledge
3. Lead toward the key insight

Format your response as:
Question 1: [question]
Hint 1: [optional hint if they struggle]

Question 2: [question]
Hint 2: [optional hint]

...and so on."""

        response_text = await self.llm_service.generate_response(prompt)

        return {
            "strategy": "socratic",
            "content": response_text,
            "interactive": True,
            "title": f"Discovery: {content['title']}"
        }

    async def worked_example(self, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Show complete worked example with step-by-step reasoning.
        """
        code_examples = content['content'].get('code_examples', [])
        
        prompt = f"""You are teaching "{content['title']}" to a {context.get('student_level', 'beginner')} student.

Create an extremely detailed worked example that demonstrates this concept in action.

Concept: {content['content']['definition']}
Explanation: {content['content']['explanation']}

{"Code base for example: " + code_examples[0]['code'] if code_examples else ""}

Provide:
1. A clear problem statement
2. Step-by-step solution with deep reasoning for each step (The "Why")
3. Final solution / implementation
4. Key takeaways for mastery

Make it concrete and specific. Use {context.get('learning_style', 'visual')} learning style metaphors where appropriate."""

        response_text = await self.llm_service.generate_response(prompt)

        return {
            "strategy": "worked_example",
            "content": response_text,
            "interactive": False,
            "title": f"Applied: {content['title']}"
        }

    async def analogy_based(self, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Explain using analogies and metaphors.
        """
        prompt = f"""You are teaching "{content['title']}" using powerful analogies.

Concept: {content['content']['definition']}
Detailed Explanation: {content['content']['explanation']}

Create 2-3 powerful analogies that explain this concept:
1. One everyday analogy (something familiar like a kitchen, a library, or a construction site)
2. One analogy specific to {context.get('interests', 'general technology')}
3. Connect the analogy back to the technical concept using "Bridge Explanations"

Student level: {context.get('student_level', 'beginner')}

Make analogies vivid, memorable, and "Ultra Pro Max" clear."""

        response_text = await self.llm_service.generate_response(prompt)

        return {
            "strategy": "analogy",
            "content": response_text,
            "interactive": False,
            "title": f"Analogy: {content['title']}"
        }

    async def incremental_complexity(self, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Start simple, gradually increase complexity.
        """
        prompt = f"""You are teaching "{content['title']}" using incremental complexity (Scaffolding).

Start with the absolute simplest version of this concept, then gradually build up complexity.

Concept: {content['content']['definition']}
Full High-Level explanation: {content['content']['explanation']}

Create a lesson with 4 distinct levels:
1. Level 1: Foundation (Explain like I'm 10)
2. Level 2: Building Up (Add the first layer of technical detail)
3. Level 3: Real-world optimization (Introduce edge cases or complications)
4. Level 4: Master Level (Full technical depth and architectural implications)

Student's current level: {context.get('student_level', 'beginner')}

Format:
### Level 1: Foundation
[explanation]

### Level 2: Building Up
[explanation]

..."""

        # Using a higher max_tokens indirectly via LLMService or just standard
        response_text = await self.llm_service.generate_response(prompt)

        return {
            "strategy": "incremental",
            "content": response_text,
            "interactive": False,
            "title": f"Blueprint: {content['title']}"
        }

    async def visual_teaching(self, content: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create text-based visual representations and diagrams.
        """
        prompt = f"""You are teaching "{content['title']}" using visual-first logic.

Concept: {content['content']['definition']}

Create sophisticated ASCII art diagrams or clear structural visual descriptions using text characters that illustrate:
1. The physical structure/components of this concept in memory or logic.
2. The dynamic data flow (Step-by-Step).
3. A "Heatmap" of complexity or common patterns.

Use boxes [ ], arrows -->, and clear labels. Make it visually striking even in text format.

Student level: {context.get('student_level', 'beginner')}"""

        response_text = await self.llm_service.generate_response(prompt)

        return {
            "strategy": "visual",
            "content": response_text,
            "interactive": False,
            "visual_aids": content['content'].get('visual_aids', []),
            "title": f"Visualizing {content['title']}"
        }
