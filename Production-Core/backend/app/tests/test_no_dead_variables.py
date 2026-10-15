"""Variables that are assigned and never read are removed: they suggest behaviour (a preferred style, a requested concept or
session length) that does not exist."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1]


def source(rel):
    return (APP / rel).read_text(encoding="utf-8")


def test_the_ask_route_has_no_unused_preferred_style():
    assert "pref_style" not in source("api/v1/rag.py")


def test_the_session_start_handler_does_not_read_values_it_never_uses():
    src = source("api/v1/websocket.py")
    assert "initial_concept_id = payload" not in src and "available_time_minutes = payload" not in src
