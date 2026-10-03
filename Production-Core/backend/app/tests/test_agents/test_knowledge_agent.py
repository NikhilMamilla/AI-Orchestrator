
import pytest
import sys
import os

# Add project root to sys.path
sys.path.append(os.getcwd())

from backend.app.agents.knowledge.agent import KnowledgeAgent
from backend.app.agents.knowledge.rag_pipeline import RAGPipeline
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_rag_pipeline():
    pipeline = MagicMock(spec=RAGPipeline)
    # Mocking the retrieval result
    pipeline.retrieve = AsyncMock(return_value=[
        {
            "concept_id": "mock_id_123",
            "title": "Binary Search",
            "score": 0.95,
            "document": "Binary search is an efficient algorithm..."
        }
    ])
    
    # Create a mock Concept object (simulating Pydantic model)
    mock_concept = MagicMock()
    mock_concept.id = "mock_id_123"
    mock_concept.title = "Binary Search"
    mock_concept.slug = "binary-search"
    mock_concept.difficulty_level = 2
    mock_concept.estimated_time_minutes = 45
    mock_concept.prerequisites = []
    mock_concept.related_concepts = []
    mock_concept.tags = ["algorithm"]
    
    # Nested Content Mock
    mock_concept.content = MagicMock()
    mock_concept.content.definition = "Binary search definition"
    mock_concept.content.explanation_beginner = "Simple explanation"
    mock_concept.content.explanation_intermediate = "Detailed explanation"
    mock_concept.content.explanation_advanced = "Advanced explanation"
    
    # Code examples list
    mock_ex = MagicMock()
    mock_ex.model_dump.return_value = {"language": "python", "code": "def binary_search():", "explanation": "Example"}
    mock_concept.content.code_examples = [mock_ex, mock_ex, mock_ex]
    
    mock_concept.content.visual_aids = []
    mock_concept.content.common_mistakes = []
    mock_concept.content.real_world_applications = []
    
    pipeline.get_full_content = AsyncMock(return_value=[mock_concept])
    return pipeline

@pytest.fixture
def mock_concept_service():
    return MagicMock()

@pytest.fixture
def knowledge_agent(mock_rag_pipeline, mock_concept_service):
    return KnowledgeAgent(rag_pipeline=mock_rag_pipeline, concept_service=mock_concept_service)

@pytest.mark.asyncio
async def test_retrieve_content_beginner(knowledge_agent):
    """Test content retrieval for beginner level"""
    result = await knowledge_agent.retrieve_content(
        concept_query="binary search",
        student_level="beginner"
    )
    
    assert "error" not in result
    assert result["title"] == "Binary Search"
    assert result["content"]["explanation"] == "Simple explanation"
    # Beginner should get 1 example based on _select_code_examples logic
    assert len(result["content"]["code_examples"]) == 1

@pytest.mark.asyncio
async def test_retrieve_content_advanced(knowledge_agent):
    """Test content retrieval for advanced level"""
    result = await knowledge_agent.retrieve_content(
        concept_query="binary search",
        student_level="advanced"
    )
    
    assert result["content"]["explanation"] == "Advanced explanation"
    # Advanced should get all 3 examples
    assert len(result["content"]["code_examples"]) == 3

@pytest.mark.asyncio
async def test_retrieve_content_not_found(knowledge_agent, mock_rag_pipeline):
    """Test when content is not found"""
    mock_rag_pipeline.retrieve = AsyncMock(return_value=[])
    
    result = await knowledge_agent.retrieve_content(
        concept_query="nonexistent concept"
    )
    
    assert "error" in result
    assert result["error"] == "No content found"
