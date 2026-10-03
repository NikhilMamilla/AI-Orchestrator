
from typing import Dict, List, Optional, Any
import json
import logging
import re
from backend.app.services.llm import LLMService

logger = logging.getLogger(__name__)

class QuestionGenerator:
    """Generate diverse assessment questions for concepts"""

    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service

    async def generate_questions(
        self,
        concept: Dict[str, Any],
        question_count: int = 5,
        difficulty_level: int = 2,
        question_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate assessment questions for a concept
        
        Args:
            concept: Concept content package
            question_count: Number of questions to generate
            difficulty_level: 1-5 difficulty
            question_types: List of types to include (mcq, code, explanation, etc.)
        
        Returns:
            List of question objects
        """
        if not question_types:
            question_types = ["mcq", "explanation", "application", "code"]

        questions = []
        
        # Distribute questions across types
        for i in range(question_count):
            q_type = question_types[i % len(question_types)]
            
            try:
                question = await self._generate_single_question(
                    concept=concept,
                    question_type=q_type,
                    difficulty=difficulty_level,
                    question_number=len(questions) + 1
                )
                if question:
                    questions.append(question)
            except Exception as e:
                logger.error(f"❌ Error generating {q_type} question: {e}")
                continue

        return questions

    async def _generate_single_question(
        self,
        concept: Dict[str, Any],
        question_type: str,
        difficulty: int,
        question_number: int
    ) -> Dict[str, Any]:
        """Generate a single question of specified type"""
        
        generators = {
            "mcq": self._generate_mcq,
            "explanation": self._generate_explanation_question,
            "application": self._generate_application_question,
            "code": self._generate_code_question,
            "debugging": self._generate_debugging_question
        }

        generator = generators.get(question_type, self._generate_mcq)
        return await generator(concept, difficulty, question_number)

    def _extract_json(self, response_text: str) -> Dict[str, Any]:
        """Helper to extract JSON from LLM response blocks."""
        try:
            # Look for JSON between triple backticks
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            
            # Look for anything that looks like a JSON object
            json_match = re.search(r'({.*})', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Failed to parse JSON: {e}\nResponse: {response_text}")
            raise

    async def _generate_mcq(self, concept: Dict[str, Any], difficulty: int, q_num: int) -> Dict[str, Any]:
        """Generate multiple choice question"""
        
        prompt = f"""Generate a multiple-choice question about "{concept['title']}".

Concept definition: {concept['content']['definition']}
Explanation: {concept['content']['explanation']}

Difficulty level: {difficulty}/5
Cognitive level: {self._get_cognitive_target(difficulty)}

Requirements:
1. Question should test {self._get_cognitive_target(difficulty)}
2. Provide 4 options (A, B, C, D)
3. One correct answer
4. Distractors should be plausible (based on common misconceptions)
5. Include explanation of why each option is right/wrong

Format your response as a raw JSON object:
{{
  "question_text": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "...",
  "targets_misconception": "..."
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical assessment generator. Always output valid JSON."
        )
        
        question_data = self._extract_json(response_text)
        
        return {
            "question_id": f"q_{concept.get('concept_id', 'unknown')}_{q_num}",
            "question_type": "mcq",
            "difficulty": difficulty,
            "question_text": question_data["question_text"],
            "options": question_data["options"],
            "correct_answer": question_data["correct_answer"],
            "explanation": question_data["explanation"],
            "targets_misconception": question_data.get("targets_misconception", "")
        }

    async def _generate_explanation_question(self, concept: Dict[str, Any], difficulty: int, q_num: int) -> Dict[str, Any]:
        """Generate question asking student to explain concept"""
        
        prompt = f"""Generate a question that asks the student to explain "{concept['title']}" in their own words.

Concept: {concept['content']['definition']}

Difficulty: {difficulty}/5

The question should:
1. Test understanding, not just memorization
2. Be specific (not just "explain this concept")
3. Have clear criteria for a good answer

Provide:
- Question text
- Key points that should be in a complete answer
- What constitutes partial understanding vs full understanding

Format your response as a raw JSON object:
{{
  "question_text": "...",
  "key_points": ["point1", "point2", "point3"],
  "full_understanding_criteria": "...",
  "partial_understanding_criteria": "..."
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical assessment generator. Always output valid JSON."
        )

        question_data = self._extract_json(response_text)

        return {
            "question_id": f"q_{concept.get('concept_id', 'unknown')}_{q_num}",
            "question_type": "explanation",
            "difficulty": difficulty,
            "question_text": question_data["question_text"],
            "key_points": question_data["key_points"],
            "evaluation_criteria": {
                "full_understanding": question_data["full_understanding_criteria"],
                "partial_understanding": question_data["partial_understanding_criteria"]
            }
        }

    async def _generate_application_question(self, concept: Dict[str, Any], difficulty: int, q_num: int) -> Dict[str, Any]:
        """Generate question applying concept to new situation"""
        
        prompt = f"""Generate a question that requires applying "{concept['title']}" to a real-world scenario.

Concept: {concept['content']['definition']}
Applications: {concept['content'].get('real_world_applications', [])}

Difficulty: {difficulty}/5

Create a scenario where the student must:
1. Recognize when to use this concept
2. Apply it correctly
3. Explain their reasoning

Format your response as a raw JSON object:
{{
  "scenario": "...",
  "question_text": "...",
  "correct_approach": "...",
  "common_mistakes": ["mistake1", "mistake2"]
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical assessment generator. Always output valid JSON."
        )

        question_data = self._extract_json(response_text)

        return {
            "question_id": f"q_{concept.get('concept_id', 'unknown')}_{q_num}",
            "question_type": "application",
            "difficulty": difficulty,
            "scenario": question_data["scenario"],
            "question_text": question_data["question_text"],
            "correct_approach": question_data["correct_approach"],
            "common_mistakes": question_data.get("common_mistakes", [])
        }

    async def _generate_code_question(self, concept: Dict[str, Any], difficulty: int, q_num: int) -> Dict[str, Any]:
        """Generate coding question"""
        
        code_examples = concept['content'].get('code_examples', [])
        example_code = code_examples[0]['code'] if code_examples else "No example available"

        prompt = f"""Generate a coding question for "{concept['title']}".

Concept: {concept['content']['definition']}
Example code: {example_code}

Difficulty: {difficulty}/5

Create:
1. Problem statement
2. Input/output examples
3. Test cases
4. Starter code (optional)

Format your response as a raw JSON object:
{{
  "problem_statement": "...",
  "examples": [{{"input": "...", "output": "..."}}, ...],
  "test_cases": [{{"input": "...", "expected_output": "..."}}, ...],
  "starter_code": "...",
  "hints": ["hint1", "hint2"]
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical assessment generator. Always output valid JSON."
        )

        question_data = self._extract_json(response_text)

        return {
            "question_id": f"q_{concept.get('concept_id', 'unknown')}_{q_num}",
            "question_type": "code",
            "difficulty": difficulty,
            "problem_statement": question_data["problem_statement"],
            "examples": question_data["examples"],
            "test_cases": question_data["test_cases"],
            "starter_code": question_data.get("starter_code", ""),
            "hints": question_data.get("hints", [])
        }

    async def _generate_debugging_question(self, concept: Dict[str, Any], difficulty: int, q_num: int) -> Dict[str, Any]:
        """Generate debugging question (find the error)"""
        
        prompt = f"""Generate a debugging question for "{concept['title']}".

Concept: {concept['content']['definition']}
Common mistakes: {concept['content'].get('common_mistakes', [])}

Create buggy code that demonstrates a common mistake. Student must:
1. Identify the bug
2. Explain why it's wrong
3. Fix it

Format your response as a raw JSON object:
{{
  "buggy_code": "...",
  "bug_description": "...",
  "correct_code": "...",
  "explanation": "..."
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical assessment generator. Always output valid JSON."
        )

        question_data = self._extract_json(response_text)

        return {
            "question_id": f"q_{concept.get('concept_id', 'unknown')}_{q_num}",
            "question_type": "debugging",
            "difficulty": difficulty,
            "buggy_code": question_data["buggy_code"],
            "bug_description": question_data["bug_description"],
            "correct_code": question_data["correct_code"],
            "explanation": question_data["explanation"]
        }

    def _get_cognitive_target(self, difficulty: int) -> str:
        """Map difficulty to cognitive level"""
        if difficulty <= 2:
            return "recall and recognition"
        elif difficulty <= 3:
            return "understanding and comprehension"
        elif difficulty <= 4:
            return "application and analysis"
        else:
            return "synthesis and evaluation"
