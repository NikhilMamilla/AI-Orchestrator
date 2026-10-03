
from backend.app.services.concept_service import ConceptService
from backend.app.services.llm import LLMService
from backend.app.agents.knowledge import KnowledgeAgent, RAGPipeline
from backend.app.agents.teaching import TeachingAgent
from backend.app.agents.assessment import AssessmentAgent
from backend.app.agents.analyst import AnalystAgent
from backend.app.services.student_profile_service import StudentProfileService

from backend.app.agents.orchestrator import OrchestratorAgent
from backend.app.services.message_queue import MessageQueue
from backend.app.config import settings

class AgentFactory:
    def __init__(self, db, store):
        """db: Postgres access for learner data; store: the knowledge store (concepts + RAG)."""
        self.db = db
        self.store = store
        self.concept_service = ConceptService(store)
        self.profile_service = StudentProfileService(db)
        self.llm_service = LLMService()
        self.message_queue = MessageQueue(settings.REDIS_URL)

    async def connect(self):
        """Connect all async infrastructure"""
        await self.message_queue.connect()

    def create_knowledge_agent(self) -> KnowledgeAgent:
        """Instantiates a KnowledgeAgent with its full RAG pipeline."""
        from backend.app.rag.pipeline import RAGPipeline as HybridPipeline
        from backend.app.services import rag_service
        hybrid: HybridPipeline = rag_service._pipeline            # initialised by get_pipeline() at the endpoint
        return KnowledgeAgent(RAGPipeline(hybrid, self.concept_service), self.concept_service)

    def create_teaching_agent(self) -> TeachingAgent:
        """Instantiates a TeachingAgent with LLM capabilities."""
        return TeachingAgent(self.llm_service)

    def create_assessment_agent(self) -> AssessmentAgent:
        """Instantiates an AssessmentAgent with LLM and evaluation capabilities."""
        return AssessmentAgent(self.llm_service)

    def create_analyst_agent(self) -> AnalystAgent:
        """Instantiates an AnalystAgent with behavioral analysis capabilities."""
        return AnalystAgent(self.llm_service, self.profile_service)

    def create_orchestrator_agent(self) -> OrchestratorAgent:
        """Instantiates the master coordinator OrchestratorAgent."""
        return OrchestratorAgent(self.llm_service, self.message_queue)
