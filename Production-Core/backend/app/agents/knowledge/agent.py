
from typing import Dict, List, Optional, Any
from backend.app.agents.knowledge.rag_pipeline import RAGPipeline
from backend.app.services.concept_service import ConceptService
from backend.app.models.concept import Concept
import logging

logger = logging.getLogger(__name__)

class KnowledgeAgent:
    """
    Knowledge Curator Agent
    
    Responsibilities:
    - Retrieve relevant educational content
    - Rank content by relevance and quality
    - Adapt difficulty based on student level
    - Provide diverse content types
    """

    def __init__(self, rag_pipeline: RAGPipeline, concept_service: ConceptService):
        self.rag_pipeline = rag_pipeline
        self.concept_service = concept_service
        self.agent_name = "knowledge_agent"

    async def retrieve_content(
        self, 
        concept_query: str, 
        student_level: str = "beginner",
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Main entry point: Retrieve content for a concept
        
        Args:
            concept_query: What concept to retrieve (e.g., "binary search")
            student_level: "beginner", "intermediate", "advanced"
            context: Additional context (student ID, learning style, etc.)
        
        Returns:
            Content package with explanations, examples, visuals
        """
        logger.info(f"[{self.agent_name}] Retrieving content for: {concept_query}, level: {student_level}")

        # Step 1: hybrid retrieval (learner level + weak concepts influence ranking)
        weak = (context or {}).get("weak_concepts", [])
        retrieved_docs = await self.rag_pipeline.retrieve(
            query=concept_query, n_results=3, level=student_level, weak_concepts=weak)

        if not retrieved_docs:
            logger.warning(f"[{self.agent_name}] No content found for query: {concept_query}")
            return {"error": "No content found"}

        # Step 2: Load full concept content
        concept_ids = [doc['concept_id'] for doc in retrieved_docs]
        concepts = await self.rag_pipeline.get_full_content(concept_ids)

        if not concepts:
            logger.error(f"[{self.agent_name}] Content not available in database")
            return {"error": "Content not available"}

        # Step 3: Select best concept (usually first one)
        primary_concept = concepts[0]

        # Step 4: Adapt content to student level
        adapted_content = self._adapt_to_level(primary_concept, student_level, context)

        # Step 5: Build content package
        # "score" is the retrieval similarity, 0 to 1
        content_package = {
            "concept_id": str(primary_concept.id),
            "title": primary_concept.title,
            "slug": primary_concept.slug,
            "difficulty_level": primary_concept.difficulty_level,
            "estimated_time_minutes": primary_concept.estimated_time_minutes,
            "content": adapted_content,
            "prerequisites": [str(pid) for pid in primary_concept.prerequisites],
            "related_concepts": [str(rid) for rid in primary_concept.related_concepts],
            "tags": primary_concept.tags,
            "metadata": {
                "retrieval_confidence": retrieved_docs[0]['score'],
                "sources_used": [doc['title'] for doc in retrieved_docs[:3]],
                "agent": self.agent_name
            }
        }

        logger.info(f"[{self.agent_name}] Content package created for: {primary_concept.title}")
        return content_package

    async def get_prerequisites_content(self, concept_id: str) -> List[Dict[str, Any]]:
        """
        Get content for all prerequisites of a concept
        """
        prerequisites = await self.concept_service.get_prerequisites(concept_id)
        
        prereq_content = []
        for prereq in prerequisites:
            content = await self.retrieve_content(
                concept_query=prereq.title,
                student_level="beginner"  # Prerequisites should be simpler
            )
            prereq_content.append(content)
        
        return prereq_content

    def _adapt_to_level(self, concept: Concept, level: str, context: Optional[Dict]) -> Dict[str, Any]:
        """Select appropriate content version based on student level"""
        # Select explanation based on level
        if level == "beginner":
            explanation = concept.content.explanation_beginner
        elif level == "intermediate":
            explanation = concept.content.explanation_intermediate or concept.content.explanation_beginner
        else:
            explanation = concept.content.explanation_advanced or concept.content.explanation_intermediate or concept.content.explanation_beginner

        # Determine learning style preference
        learning_style = "visual"  # Default
        if context and "learning_style" in context:
            learning_style = context["learning_style"]

        # Build adapted content
        adapted = {
            "definition": concept.content.definition,
            "explanation": explanation,
            "code_examples": self._select_code_examples(concept, level),
            "visual_aids": concept.content.visual_aids if learning_style == "visual" else [],
            "common_mistakes": concept.content.common_mistakes,
            "real_world_applications": concept.content.real_world_applications
        }

        return adapted

    def _select_code_examples(self, concept: Concept, level: str) -> List[Dict[str, Any]]:
        """Select appropriate code examples based on level"""
        examples = [ex.model_dump() for ex in concept.content.code_examples]

        if level == "beginner":
            return examples[:1]  # First example only
        elif level == "intermediate":
            return examples[:2]  # First two examples
        else:
            return examples  # All examples
