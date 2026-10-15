"""Learner preferences (PRD Feature 4) and the opt-in leaderboard (PRD Feature 2E).

Preferences change real behaviour: `tone` is written into the tutor's prompt, `style` is the default teaching style on
the Ask page, `session_minutes` is the default length of the planned session. The leaderboard shows only a nickname the
learner chose, only if they opted in, ranked by a number derived from their own measured mastery.
"""
from __future__ import annotations

import codecs
import re
from typing import Any, Dict, List, Mapping, Optional, Sequence

STYLES = ("auto", "default", "socratic", "worked_example", "analogy")
TONES = ("encouraging", "neutral", "challenging")
UI_DEFAULTS: Dict[str, Any] = {"theme": "system", "text_size": 100, "petals": True, "motion": "full", "contrast": False}
DEFAULTS: Dict[str, Any] = {"style": "auto", "tone": "neutral", "session_minutes": 40, "ui": dict(UI_DEFAULTS)}
NICK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$")


class PrefsError(ValueError):
    pass


def clean_prefs(raw: Mapping[str, Any]) -> Dict[str, Any]:
    out = dict(DEFAULTS)
    if "style" in raw:
        if raw["style"] not in STYLES:
            raise PrefsError("Unknown teaching style.")
        out["style"] = raw["style"]
    if "tone" in raw:
        if raw["tone"] not in TONES:
            raise PrefsError("Unknown tone.")
        out["tone"] = raw["tone"]
    if "session_minutes" in raw:
        m = raw["session_minutes"]
        if not isinstance(m, int) or isinstance(m, bool) or not 10 <= m <= 120:
            raise PrefsError("Session length must be between 10 and 120 minutes.")
        out["session_minutes"] = m
    out["ui"] = clean_ui(raw.get("ui") or {}, base=out["ui"])
    return out


def clean_ui(raw: Mapping[str, Any], base: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """Appearance, saved on the server so it follows the learner to every device."""
    out = dict(base or UI_DEFAULTS)
    if "theme" in raw:
        if raw["theme"] not in ("light", "dark", "system"):
            raise PrefsError("Unknown theme.")
        out["theme"] = raw["theme"]
    if "text_size" in raw:
        if raw["text_size"] not in (90, 100, 110, 120):
            raise PrefsError("Text size must be 90, 100, 110 or 120%.")
        out["text_size"] = raw["text_size"]
    for key in ("petals", "contrast"):
        if key in raw:
            if not isinstance(raw[key], bool):
                raise PrefsError(f"{key} must be true or false.")
            out[key] = raw[key]
    if "motion" in raw:
        if raw["motion"] not in ("full", "reduce"):
            raise PrefsError("Motion must be full or reduce.")
        out["motion"] = raw["motion"]
    return out


def merged(stored: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    try:
        return clean_prefs(stored or {})
    except PrefsError:                                              # corrupted stored value: fall back to defaults, never fail a request
        return dict(DEFAULTS)


# Words a public nickname may not contain. Kept ROT13-encoded so this file is safe to open; matched after the nickname is lower-cased,
# stripped of spaces/_/-, de-leetspeaked and de-stuttered ("f u c k", "sh1t", "fuuuck" are all caught). Every entry is 4+ letters, so
# ordinary names ("Class", "Dick" the name is not listed) are not caught by accident.
_BLOCKED_ROT13 = ("shpx", "fuvg", "ovgpu", "onfgneq", "nffubyr", "phag", "fyhg", "juber", "cbea", "avtt", "snttbg", "ergneq", "encvfg", "pbpxfhpx")
# real words that contain a blocked string (the "Scunthorpe problem"); removed before matching
_INNOCENT = ("scunthorpe", "shiitake", "shitake", "assessor")
_LINK_WORDS = ("http", "www", "dotcom", "dotnet", "dotorg", "gmail", "yahoo", "hotmail", "outlook", "protonmail", "telegram", "whatsapp")
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g"})


def _squash(text: str) -> str:
    plain = re.sub(r"[\s_-]+", "", text.lower()).translate(_LEET)
    return re.sub(r"(.)\1+", r"\1", plain)


_BLOCKED = tuple(_squash(codecs.decode(w, "rot13")) for w in _BLOCKED_ROT13)
_LINKS = tuple(_squash(w) for w in _LINK_WORDS)                    # normalised the same way as the nickname


def clean_nickname(nick: str) -> str:
    nick = " ".join(nick.split())
    if not NICK.match(nick):
        raise PrefsError("Nickname must be 3 to 20 letters, numbers, spaces, _ or -.")
    squashed = _squash(nick)
    for ok in _INNOCENT:
        squashed = squashed.replace(_squash(ok), "")
    if any(w in squashed for w in _BLOCKED) or any(w in squashed for w in _LINKS):
        raise PrefsError("Pick a different nickname: it can't contain offensive words, an email address or a link.")
    return nick


def points(concept_mastery: Sequence[Mapping[str, Any]]) -> int:
    """Mastery points: ten per concept's worth of measured mastery (so 26 mastered concepts would be 260)."""
    return round(10 * sum(float(m.get("mastery_level", 0.0)) for m in concept_mastery))


def board(rows: Sequence[Mapping[str, Any]], me: str, top: int = 10) -> Dict[str, Any]:
    """rows: [{uid, nick, cm}] for opted-in learners. Returns the top list plus the caller's own rank."""
    scored = sorted(({"uid": r["uid"], "nickname": r["nick"], "points": points(r["cm"] or [])} for r in rows),
                    key=lambda r: (-r["points"], r["nickname"].lower()))
    ranked: List[Dict[str, Any]] = []
    for i, r in enumerate(scored, 1):
        ranked.append({"rank": i, "nickname": r["nickname"], "points": r["points"], "you": r["uid"] == me})
    mine = next((r for r in ranked if r["you"]), None)
    return {"top": ranked[:top], "you": mine, "participants": len(ranked)}
