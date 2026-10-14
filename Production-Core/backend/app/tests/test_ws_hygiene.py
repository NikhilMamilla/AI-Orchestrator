"""Live-session WebSocket hygiene: no raw exception text for the client, a sane number of stream frames, and an explicit
acknowledgement once the server has accepted the login."""
from types import SimpleNamespace

from backend.app.api.v1 import websocket as ws
from backend.app.tests.test_abuse_limits import _live_socket, app  # noqa: F401  (app is a fixture)
from backend.app.security import RateLimiter


class FakeSocket:
    def __init__(self):
        self.frames = []

    async def send_json(self, data):
        self.frames.append(data)


async def test_streamed_text_arrives_whole_in_few_frames():
    sock, manager = FakeSocket(), ws.ConnectionManager()
    manager.active_connections["s"] = sock
    text = "Binary search halves the search space at every step. " * 4
    await manager.send_streaming_message("s", text)
    chunks = [f["chunk"] for f in sock.frames if f["type"] == "stream_chunk"]
    assert "".join(chunks) == text
    assert len(chunks) <= len(text) // 4                       # not one frame per character
    assert sock.frames[-1]["type"] == "stream_end" and sock.frames[-1]["full_text"] == text


async def test_profile_errors_never_leak_exception_text_to_the_client():
    class Broken:
        async def get_profile_by_user_id(self, uid):
            raise RuntimeError("password authentication failed for user postgres.secretref")

    sock, state = FakeSocket(), {"user_id": "u1", "interactions": []}
    await ws.handle_start_session(sock, "u1:active", {}, SimpleNamespace(), Broken(), state)
    assert sock.frames and sock.frames[0]["type"] == "error"
    assert "secretref" not in sock.frames[0]["message"] and "password" not in sock.frames[0]["message"]


def test_server_acknowledges_a_successful_login(app, monkeypatch):  # noqa: F811
    client = _live_socket(app, monkeypatch, RateLimiter(100))
    with client as c, c.websocket_connect("/api/v1/ws/session/active") as sock:
        sock.send_json({"type": "auth", "token": "t"})
        assert sock.receive_json() == {"type": "auth_ok"}
