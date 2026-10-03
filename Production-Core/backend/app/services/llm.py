"""LLM access for the agents: one shared multi-provider router (Mistral -> Gemini -> Groq by default)."""
from __future__ import annotations

import logging
from typing import Optional

from backend.app.config import settings
from backend.app.rag.llm import (GeminiClient, GroqClient, LLMRouter, LLMUnavailable, MistralClient)

logger = logging.getLogger(__name__)
_router: Optional[LLMRouter] = None

UNAVAILABLE_MESSAGE = ("I can't reach the language model right now, so I can't generate a new explanation. "
                       "Please try again in a moment.")


def get_router() -> LLMRouter:
    """Process-wide router so key rotation, cool-downs and the response cache are shared."""
    global _router
    if _router is None:
        providers = {"mistral": MistralClient(settings.mistral_keys_list),
                     "gemini": GeminiClient(settings.gemini_keys_list),
                     "groq": GroqClient(settings.groq_keys_list)}
        order = [n.strip() for n in settings.LLM_PROVIDERS.split(",") if n.strip() in providers]
        _router = LLMRouter([providers[n] for n in order])
    return _router


VISION_MODELS = ("pixtral-12b-2409",)
_vision: Optional[LLMRouter] = None


def get_vision_router() -> LLMRouter:
    """Mistral's vision model, used only to read hand-drawn diagrams (never to judge them)."""
    global _vision
    if _vision is None:
        _vision = LLMRouter([MistralClient(settings.mistral_keys_list, models=VISION_MODELS, timeout=60.0)])
    return _vision


class LLMService:
    """Thin compatibility layer for the agents, which call `generate_response(prompt, system_prompt)`."""

    def __init__(self) -> None:
        self.router = get_router()

    @property
    def available(self) -> bool:
        return self.router.available

    async def generate_response(self, prompt: str,
                                system_prompt: str = "You are an expert educational teaching assistant.",
                                timeout: float = 60.0, temperature: float = 0.5, max_tokens: int = 1200) -> str:
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}]
        try:
            return (await self.router.complete(messages, temperature=temperature, max_tokens=max_tokens)).text
        except LLMUnavailable as e:
            logger.warning("agent LLM call failed: %s", e)
            return UNAVAILABLE_MESSAGE
