
import json
import logging
from typing import Dict, List, Optional, Any
from backend.app.services.llm import LLMService
from backend.app.services.code_execution import CodeExecutionService
import re

logger = logging.getLogger(__name__)

class AnswerEvaluator:
    """Evaluate student answers with deep analysis"""

    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service
        self.code_executor = CodeExecutionService()

    async def evaluate_answer(
        self,
        question: Dict[str, Any],
        student_answer: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate student's answer
        
        Returns:
            {
                "is_correct": bool,
                "score": float (0-1),
                "feedback": str,
                "misconception_detected": str,
                "partial_credit_reasoning": str,
                "what_student_knows": [str],
                "what_student_missing": [str]
            }
        """
        question_type = question["question_type"]

        evaluators = {
            "mcq": self._evaluate_mcq,
            "explanation": self._evaluate_explanation,
            "application": self._evaluate_application,
            "code": self._evaluate_code,
            "debugging": self._evaluate_debugging
        }

        evaluator = evaluators.get(question_type, self._evaluate_generic)
        return await evaluator(question, student_answer, context)

    def _extract_json(self, response_text: str) -> Dict[str, Any]:
        """Helper to extract JSON from LLM response blocks."""
        try:
            json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            json_match = re.search(r'({.*})', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            return json.loads(response_text)
        except Exception as e:
            logger.error(f"Failed to parse JSON: {e}\nResponse: {response_text}")
            raise

    async def _evaluate_mcq(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate multiple choice answer"""
        
        correct_answer = question["correct_answer"]
        # Normalize answer: handle "A", "A)", "Option A"
        clean_answer = re.sub(r'[^A-D]', '', answer.upper()[:2])
        is_correct = clean_answer == correct_answer.upper()

        feedback = question.get("explanation", "")

        return {
            "is_correct": is_correct,
            "score": 1.0 if is_correct else 0.0,
            "feedback": feedback,
            "misconception_detected": question.get("targets_misconception", "") if not is_correct else "",
            "partial_credit_reasoning": "MCQ questions are binary (correct or incorrect)",
            "what_student_knows": ["Selected an answer"] if answer else [],
            "what_student_missing": [f"Correct answer is {correct_answer}"] if not is_correct else []
        }

    async def _evaluate_explanation(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate explanation-type answer using LLM"""
        
        prompt = f"""Evaluate this student's explanation.

Question: {question['question_text']}

Key points that should be covered:
{chr(10).join(f"- {point}" for point in question.get('key_points', []))}

Student's answer: "{answer}"

Evaluate:
1. Is the explanation correct?
2. What key points did they cover?
3. What key points are they missing?
4. Any misconceptions detected?
5. Partial credit score (0.0 to 1.0)

Format your response as a raw JSON object:
{{
  "is_correct": true,
  "score": 0.8,
  "feedback": "constructive feedback",
  "points_covered": ["point1", ...],
  "points_missing": ["point2", ...],
  "misconception_detected": "...",
  "what_student_understands": "summary",
  "what_needs_work": "summary"
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical evaluator. Always output valid JSON."
        )

        evaluation = self._extract_json(response_text)

        return {
            "is_correct": evaluation["is_correct"],
            "score": evaluation["score"],
            "feedback": evaluation["feedback"],
            "misconception_detected": evaluation.get("misconception_detected", ""),
            "partial_credit_reasoning": f"Covered {len(evaluation.get('points_covered', []))}/{len(question.get('key_points', []))} key points",
            "what_student_knows": evaluation.get("points_covered", []),
            "what_student_missing": evaluation.get("points_missing", [])
        }

    async def _evaluate_application(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate application-type answer"""
        
        prompt = f"""Evaluate the student's application of the concept.

Scenario: {question.get('scenario', '')}
Question: {question['question_text']}
Correct approach: {question.get('correct_approach', '')}
Common mistakes: {question.get('common_mistakes', [])}

Student's answer: "{answer}"

Evaluate:
1. Did they identify the correct approach?
2. Did they apply it correctly?
3. Any common mistakes made?
4. Partial credit if reasoning is partially correct

Format your response as a raw JSON object:
{{
  "is_correct": true,
  "score": 0.5,
  "feedback": "...",
  "approach_identified": true,
  "application_correct": false,
  "mistakes_made": ["mistake1", ...],
  "good_aspects": ["aspect1", ...]
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical evaluator. Always output valid JSON."
        )

        evaluation = self._extract_json(response_text)

        return {
            "is_correct": evaluation["is_correct"],
            "score": evaluation["score"],
            "feedback": evaluation["feedback"],
            "misconception_detected": ", ".join(evaluation.get("mistakes_made", [])),
            "partial_credit_reasoning": "Application partially correct" if 0 < evaluation["score"] < 1 else "",
            "what_student_knows": evaluation.get("good_aspects", []),
            "what_student_missing": evaluation.get("mistakes_made", [])
        }

    async def _evaluate_code(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate code answer by running test cases"""
        
        test_results = []
        
        for test_case in question.get("test_cases", []):
            result = await self.code_executor.execute_code(
                code=answer,
                language="python",
                stdin=test_case.get("input", "")
            )
            
            # Simple string comparison for output
            actual_output = result.get("stdout", "").strip()
            expected_output = str(test_case["expected_output"]).strip()
            
            passed = actual_output == expected_output
            test_results.append({
                "input": test_case["input"],
                "expected": expected_output,
                "actual": actual_output,
                "passed": passed,
                "stderr": result.get("stderr", "")
            })

        # Calculate score
        passed_count = sum(1 for t in test_results if t["passed"])
        total_tests = len(test_results)
        score = passed_count / total_tests if total_tests > 0 else 0.0

        # Generate feedback
        if score == 1.0:
            feedback = "✅ All test cases passed! Great work."
        elif score > 0:
            feedback = f"⚠️ {passed_count}/{total_tests} test cases passed. Review the failing cases."
        else:
            feedback = "❌ No test cases passed. Check your logic and syntax."

        return {
            "is_correct": score == 1.0,
            "score": score,
            "feedback": feedback,
            "test_results": test_results,
            "misconception_detected": "Syntax error or logical bug" if score < 1.0 else "",
            "partial_credit_reasoning": f"Passed {passed_count}/{total_tests} tests",
            "what_student_knows": [f"Test {i+1} passed" for i, t in enumerate(test_results) if t["passed"]],
            "what_student_missing": [f"Test {i+1} failed" for i, t in enumerate(test_results) if not t["passed"]]
        }

    async def _evaluate_debugging(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluate debugging answer"""
        
        prompt = f"""Evaluate student's debugging solution.

Buggy code: {question.get('buggy_code', '')}
Bug description: {question.get('bug_description', '')}
Correct fix: {question.get('correct_code', '')}

Student's answer: "{answer}"

Did they:
1. Identify the bug correctly?
2. Explain why it's wrong?
3. Provide correct fix?

Format your response as a raw JSON object:
{{
  "is_correct": true,
  "score": 1.0,
  "feedback": "...",
  "bug_identified": true,
  "explanation_correct": true,
  "fix_correct": true
}}"""

        response_text = await self.llm_service.generate_response(
            prompt=prompt,
            system_prompt="You are a strict technical evaluator. Always output valid JSON."
        )

        evaluation = self._extract_json(response_text)

        return {
            "is_correct": evaluation["is_correct"],
            "score": evaluation["score"],
            "feedback": evaluation["feedback"],
            "misconception_detected": "Did not identify bug" if not evaluation.get("bug_identified", True) else "",
            "partial_credit_reasoning": "Partial understanding of the bug" if 0 < evaluation["score"] < 1 else "",
            "what_student_knows": [
                "Bug identified" if evaluation.get("bug_identified") else "",
                "Explanation correct" if evaluation.get("explanation_correct") else "",
                "Fix correct" if evaluation.get("fix_correct") else ""
            ],
            "what_student_missing": []
        }

    async def _evaluate_generic(self, question: Dict[str, Any], answer: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Fallback evaluator"""
        return {
            "is_correct": False,
            "score": 0.0,
            "feedback": "Unable to evaluate this question type",
            "misconception_detected": "",
            "partial_credit_reasoning": "",
            "what_student_knows": [],
            "what_student_missing": []
        }
