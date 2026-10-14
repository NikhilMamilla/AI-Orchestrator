"""The pipeline's settings for each way the server can run, in one place so the service and the evaluation scripts agree.

* local:  embeddings, reranker and claim checker run in this process (the full-quality image).
* hosted: embeddings come from Hugging Face Inference, the reranker and the claim checker use their lexical fallbacks
          (the small-server image). Their scores sit on a different scale, so the evidence gate has its own threshold.
"""
from __future__ import annotations

from backend.app.config import settings

from .pipeline import RAGConfig


def pipeline_config(hosted: bool) -> RAGConfig:
    """The pipeline configuration for the local or the hosted setup (the evidence-gate threshold differs)."""
    return RAGConfig(min_top_score=settings.RAG_GATE_HOSTED if hosted else settings.RAG_GATE_LOCAL)
