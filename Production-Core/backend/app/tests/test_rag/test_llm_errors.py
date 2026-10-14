"""A 400 that merely says a request parameter is 'invalid' must not bench the provider; a real key or account problem still does."""
import httpx
import pytest

from backend.app.rag.llm import GroqClient, LLMUnavailable

MSGS = [{"role": "user", "content": "hi"}]


def client(status, text):
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(status, text=text)))
    return GroqClient(("k1",), models=("m",), http=http)


async def test_bad_parameter_400_is_not_a_permanent_provider_failure():
    with pytest.raises(LLMUnavailable) as e:
        await client(400, '{"error":{"message":"Invalid value for max_tokens"}}').complete(MSGS)
    assert e.value.permanent is False


@pytest.mark.parametrize("status,text", [(401, "nope"), (403, "forbidden"),
                                         (400, '{"error":"Organization has been restricted"}'),
                                         (400, '{"error":"Invalid API key provided"}')])
async def test_real_key_or_account_problems_are_still_permanent(status, text):
    with pytest.raises(LLMUnavailable) as e:
        await client(status, text).complete(MSGS)
    assert e.value.permanent is True
