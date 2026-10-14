"""Identical concurrent LLM requests share one call; cancelling the first caller must not strand the others."""
import asyncio

import pytest

from backend.app.rag.llm import BaseLLM, LLMResult, LLMUnavailable


class Slow(BaseLLM):
    name = "slow"

    def __init__(self, delay: float = 0.3, fail: bool = False) -> None:
        super().__init__()
        self.calls, self.delay, self.fail = 0, delay, fail

    @property
    def available(self) -> bool:
        return True

    async def _generate(self, messages, temperature, max_tokens):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            raise LLMUnavailable("down")
        return LLMResult("ok", "m")


MSGS = [{"role": "user", "content": "same question"}]


async def test_second_caller_survives_first_being_cancelled():
    llm = Slow()
    first = asyncio.create_task(llm.complete(MSGS))
    await asyncio.sleep(0.05)
    second = asyncio.create_task(llm.complete(MSGS))
    await asyncio.sleep(0.05)
    first.cancel()
    res = await asyncio.wait_for(second, 3)          # used to hang forever
    assert res.text == "ok"
    assert llm.calls == 1                            # still one shared provider call


async def test_waiters_get_the_error_when_the_call_fails():
    llm = Slow(fail=True)
    a = asyncio.create_task(llm.complete(MSGS))
    await asyncio.sleep(0.05)
    b = asyncio.create_task(llm.complete(MSGS))
    for t in (a, b):
        with pytest.raises(LLMUnavailable):
            await asyncio.wait_for(t, 3)
    assert llm.calls == 1


async def test_inflight_table_is_cleaned_up():
    llm = Slow(delay=0.05)
    await llm.complete(MSGS)
    await asyncio.sleep(0)
    assert llm._inflight == {}
