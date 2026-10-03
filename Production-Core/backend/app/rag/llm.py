"""Free-tier LLM layer: Gemini and Groq providers behind a router with automatic failover.

* Each provider rotates API keys and walks its own model chain on 429/5xx.
* The router tries providers in order and puts a failing one on cool-down (long for
  permanent errors such as "organization restricted" or an invalid key, short for rate limits), so a
  dead provider costs nothing on later requests.
* Responses are cached (TTL) and identical concurrent requests are coalesced into one call.
* If every provider fails the pipeline falls back to an extractive, citation-bearing answer.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import httpx

logger = logging.getLogger(__name__)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
DEFAULT_MISTRAL_MODELS = ("ministral-14b-latest", "ministral-8b-latest", "open-mistral-nemo")   # mistral-small has no free-tier quota
DEFAULT_GROQ_MODELS = ("llama-3.3-70b-versatile", "llama-3.1-8b-instant")
DEFAULT_GEMINI_MODELS = ("gemini-flash-latest", "gemini-flash-lite-latest")   # rolling aliases survive model retirements
Messages = List[Dict[str, str]]


class LLMUnavailable(RuntimeError):
    def __init__(self, msg: str, permanent: bool = False):
        super().__init__(msg)
        self.permanent = permanent


@dataclass
class LLMResult:
    text: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached: bool = False
    provider: str = ""


class TTLCache:
    def __init__(self, ttl: float = 3600, cap: int = 512):
        self.ttl, self.cap, self._d = ttl, cap, {}

    def get(self, k):
        v = self._d.get(k)
        if v and time.time() - v[0] < self.ttl:
            return v[1]
        self._d.pop(k, None)
        return None

    def put(self, k, val):
        if len(self._d) >= self.cap:
            self._d.pop(min(self._d, key=lambda x: self._d[x][0]))
        self._d[k] = (time.time(), val)


class BaseLLM:
    name = "llm"

    def __init__(self) -> None:
        self.cache = TTLCache()
        self._inflight: Dict[str, asyncio.Future] = {}

    @property
    def available(self) -> bool:
        raise NotImplementedError

    async def _generate(self, messages: Messages, temperature: float, max_tokens: int) -> LLMResult:
        raise NotImplementedError

    @staticmethod
    def cache_key(messages, temperature, extra) -> str:
        return hashlib.sha256(json.dumps([messages, temperature, extra], sort_keys=True).encode()).hexdigest()

    def _cache_extra(self):
        return self.name

    async def complete(self, messages: Messages, temperature: float = 0.2, max_tokens: int = 400,
                       use_cache: bool = True) -> LLMResult:
        ck = self.cache_key(messages, temperature, self._cache_extra())
        if use_cache and (hit := self.cache.get(ck)):
            return LLMResult(**{**hit.__dict__, "cached": True})
        if ck in self._inflight:                                   # coalesce identical concurrent calls
            return await self._inflight[ck]
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._inflight[ck] = fut
        try:
            res = await self._generate(messages, temperature, max_tokens)
            if use_cache:
                self.cache.put(ck, res)
            fut.set_result(res)
            return res
        except Exception as e:
            fut.set_exception(e)
            fut.exception()                                        # mark retrieved: no "never retrieved" noise
            raise
        finally:
            self._inflight.pop(ck, None)

    async def aclose(self) -> None:
        return None


class _HttpProvider(BaseLLM):
    def __init__(self, keys: Sequence[str], models: Sequence[str], timeout: float,
                 http: Optional[httpx.AsyncClient]):
        super().__init__()
        self.keys = [k for k in keys if k]
        self.models = list(models)
        self.timeout, self._http, self._ki = timeout, http, 0

    @property
    def available(self) -> bool:
        return bool(self.keys)

    def _cache_extra(self):
        return [self.name, self.models]

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=self.timeout)
        return self._http

    async def aclose(self) -> None:
        if self._http:
            await self._http.aclose()

    # subclasses provide the wire format
    def _request(self, model: str, key: str, messages: Messages, temperature: float, max_tokens: int):
        raise NotImplementedError

    def _parse(self, data: dict, model: str) -> LLMResult:
        raise NotImplementedError

    async def _post(self, model: str, messages: Messages, temperature: float, max_tokens: int) -> LLMResult:
        last: Exception = LLMUnavailable("no API keys configured", permanent=True)
        rejected: set = set()                      # keys the provider refused outright: never retried
        for attempt in range(max(1, len(self.keys)) * 2):
            live = [k for k in self.keys if k not in rejected]
            if not live:
                break
            key = live[self._ki % len(live)]
            url, headers, body = self._request(model, key, messages, temperature, max_tokens)
            try:
                r = await self._client().post(url, headers=headers, json=body)
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last = LLMUnavailable(f"network: {type(e).__name__}")
                self._ki += 1
                continue
            if r.status_code in (400, 401, 403) and self._is_account_problem(r):
                rejected.add(key)
                last = LLMUnavailable(f"{self.name}: key/account rejected ({r.status_code})", permanent=True)
                continue
            if r.status_code == 429 or r.status_code >= 500:
                self._ki += 1
                last = LLMUnavailable(f"{self.name}: upstream {r.status_code}")
                await asyncio.sleep(min(0.4 * 2 ** (attempt // max(1, len(self.keys))), 3))
                continue
            if r.status_code >= 400:
                raise LLMUnavailable(f"{self.name}: request rejected ({r.status_code})")
            try:
                return self._parse(r.json(), model)
            except (KeyError, IndexError, ValueError, TypeError):
                raise LLMUnavailable(f"{self.name}: malformed response")
        raise last

    @staticmethod
    def _is_account_problem(r: httpx.Response) -> bool:
        t = r.text.lower()
        return r.status_code in (401, 403) or any(s in t for s in ("restricted", "api key", "api_key", "permission", "invalid"))

    async def _generate(self, messages: Messages, temperature: float, max_tokens: int) -> LLMResult:
        last: Exception = LLMUnavailable(f"{self.name}: no models")
        for model in self.models:
            try:
                return await self._post(model, messages, temperature, max_tokens)
            except LLMUnavailable as e:
                last = e
                if e.permanent:
                    break                    # a bad key/account will not be fixed by another model
        raise last


class GroqClient(_HttpProvider):
    """OpenAI-compatible chat completions (Groq; Mistral subclasses it)."""
    name = "groq"
    URL = GROQ_URL

    def __init__(self, api_keys: Sequence[str], models: Sequence[str] = DEFAULT_GROQ_MODELS,
                 timeout: float = 30.0, http: Optional[httpx.AsyncClient] = None):
        super().__init__(api_keys, models, timeout, http)

    def _request(self, model, key, messages, temperature, max_tokens):
        return (self.URL, {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens})

    def _parse(self, data, model):
        u = data.get("usage", {})
        return LLMResult(text=data["choices"][0]["message"]["content"] or "", model=model, provider=self.name,
                         prompt_tokens=u.get("prompt_tokens", 0), completion_tokens=u.get("completion_tokens", 0))


class MistralClient(GroqClient):
    name = "mistral"
    URL = MISTRAL_URL

    def __init__(self, api_keys: Sequence[str], models: Sequence[str] = DEFAULT_MISTRAL_MODELS,
                 timeout: float = 30.0, http: Optional[httpx.AsyncClient] = None):
        super().__init__(api_keys, models, timeout, http)


class GeminiClient(_HttpProvider):
    name = "gemini"

    def __init__(self, api_keys: Sequence[str], models: Sequence[str] = DEFAULT_GEMINI_MODELS,
                 timeout: float = 40.0, http: Optional[httpx.AsyncClient] = None):
        super().__init__(api_keys, models, timeout, http)

    def _request(self, model, key, messages, temperature, max_tokens):
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                    for m in messages if m["role"] != "system"]
        gen = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if "2.5" in model:
            gen["thinkingConfig"] = {"thinkingBudget": 0}        # answers are short and grounded; no hidden reasoning cost
        body = {"contents": contents, "generationConfig": gen}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        # key travels in a header, never in the URL (URLs are logged)
        return (GEMINI_URL.format(model=model), {"x-goog-api-key": key, "Content-Type": "application/json"}, body)

    def _parse(self, data, model):
        cand = data["candidates"][0]
        text = "".join(p.get("text", "") for p in cand["content"]["parts"])
        u = data.get("usageMetadata", {})
        return LLMResult(text=text, model=model, provider=self.name,
                         prompt_tokens=u.get("promptTokenCount", 0), completion_tokens=u.get("candidatesTokenCount", 0))


class LLMRouter(BaseLLM):
    """Ordered failover across providers with per-provider cool-down."""
    name = "router"
    PERMANENT_COOLDOWN = 900.0
    TRANSIENT_COOLDOWN = 45.0

    def __init__(self, providers: Sequence[BaseLLM]):
        super().__init__()
        self.providers = [p for p in providers if p.available]
        self._cool: Dict[str, float] = {}

    @property
    def available(self) -> bool:
        return bool(self.providers)

    def _cache_extra(self):
        return [p.name for p in self.providers]

    async def _generate(self, messages: Messages, temperature: float, max_tokens: int) -> LLMResult:
        last: Exception = LLMUnavailable("no LLM provider configured", permanent=True)
        now = time.monotonic()
        order = [p for p in self.providers if self._cool.get(p.name, 0) <= now] or self.providers[:1]
        for p in order:
            try:
                return await p._generate(messages, temperature, max_tokens)
            except LLMUnavailable as e:
                last = e
                cool = self.PERMANENT_COOLDOWN if e.permanent else self.TRANSIENT_COOLDOWN
                self._cool[p.name] = time.monotonic() + cool
                logger.warning("LLM provider %s failed (%s); cooling down %ds", p.name, e, cool)
        raise last

    async def aclose(self) -> None:
        for p in self.providers:
            await p.aclose()

    def status(self) -> List[Dict[str, object]]:
        now = time.monotonic()
        return [{"provider": p.name, "cooling_down": self._cool.get(p.name, 0) > now} for p in self.providers]
