"""Coding profiles a learner links in Settings, with live public stats.

GitHub, LeetCode and Codeforces have public endpoints, so their numbers are fetched from the source (server side: the
browser cannot call them across origins). HackerRank and CodeChef have no public API, so they are stored as links only
and the response says so; nothing is invented. Results are cached per handle for ten minutes, and a forced refresh is
allowed at most once a minute per handle, so a page refresh never hammers the platforms.
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any, Dict, List, Mapping, Optional

import httpx

PLATFORMS: Dict[str, Dict[str, Any]] = {
    "github": {"name": "GitHub", "url": "https://github.com/{h}", "pattern": r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$", "live": True},
    "leetcode": {"name": "LeetCode", "url": "https://leetcode.com/u/{h}/", "pattern": r"^[A-Za-z0-9_-]{3,30}$", "live": True},
    "codeforces": {"name": "Codeforces", "url": "https://codeforces.com/profile/{h}", "pattern": r"^[A-Za-z0-9_.-]{3,24}$", "live": True},
    "hackerrank": {"name": "HackerRank", "url": "https://www.hackerrank.com/profile/{h}", "pattern": r"^[A-Za-z0-9_-]{3,30}$", "live": False},
    "codechef": {"name": "CodeChef", "url": "https://www.codechef.com/users/{h}", "pattern": r"^[A-Za-z0-9_]{3,30}$", "live": False},
}
TTL, MIN_REFRESH = 600.0, 60.0
_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
UA = {"User-Agent": "Kiddoo-DSA-Tutor/1.0 (+coding profile stats)"}


class ProfileError(ValueError):
    pass


URL_PATTERNS = {
    "github": r"github\.com/([^/?#]+)",
    "leetcode": r"leetcode\.com/(?:u/)?([^/?#]+)",
    "codeforces": r"codeforces\.com/profile/([^/?#]+)",
    "hackerrank": r"hackerrank\.com/(?:profile/)?([^/?#]+)",
    "codechef": r"codechef\.com/users/([^/?#]+)",
}


def handle_from(platform: str, value: str) -> str:
    """A handle, from either the handle itself or the profile URL the learner pasted."""
    v = (value or "").strip()
    if "/" in v or v.lower().startswith(("http", "www.")) or ".com" in v.lower():
        m = re.search(URL_PATTERNS[platform], v, re.I)
        if not m:
            raise ProfileError(f"That isn't a {PLATFORMS[platform]['name']} profile link.")
        v = m.group(1)
    return v.lstrip("@")


def clean_handles(raw: Mapping[str, Any]) -> Dict[str, str]:
    """Only known platforms; an empty value removes the link; anything else must match the platform's handle rules."""
    out: Dict[str, str] = {}
    for key, value in raw.items():
        if key not in PLATFORMS:
            raise ProfileError(f"Unknown platform: {key}.")
        h = handle_from(key, value or "")
        if not h:
            continue
        if not re.fullmatch(PLATFORMS[key]["pattern"], h):          # whole string: no trailing newline
            raise ProfileError(f"That doesn't look like a valid {PLATFORMS[key]['name']} username.")
        out[key] = h
    return out


def _card(platform: str, handle: str, stats: List[Dict[str, Any]], ok: bool, note: Optional[str] = None) -> Dict[str, Any]:
    p = PLATFORMS[platform]
    return {"platform": platform, "name": p["name"], "handle": handle, "url": p["url"].format(h=handle),
            "live": p["live"], "ok": ok, "stats": stats, "note": note, "fetched_at": int(time.time())}


async def _github(c: httpx.AsyncClient, h: str) -> Dict[str, Any]:
    r = await c.get(f"https://api.github.com/users/{h}", headers={**UA, "Accept": "application/vnd.github+json"})
    if r.status_code == 404:
        return _card("github", h, [], False, "No GitHub user with that name.")
    r.raise_for_status()
    d = r.json()
    return _card("github", h, [
        {"label": "Public repos", "value": d.get("public_repos", 0)},
        {"label": "Followers", "value": d.get("followers", 0)},
        {"label": "Since", "value": (d.get("created_at") or "")[:4] or "–"},
    ], True)


LC_QUERY = """query($u: String!) { matchedUser(username: $u) {
  profile { ranking }
  submitStats { acSubmissionNum { difficulty count } } } }"""


async def _leetcode(c: httpx.AsyncClient, h: str) -> Dict[str, Any]:
    r = await c.post("https://leetcode.com/graphql", json={"query": LC_QUERY, "variables": {"u": h}},
                     headers={**UA, "Referer": "https://leetcode.com", "Content-Type": "application/json"})
    r.raise_for_status()
    user = (r.json().get("data") or {}).get("matchedUser")
    if not user:
        return _card("leetcode", h, [], False, "No LeetCode user with that name.")
    solved = {s["difficulty"]: s["count"] for s in (user.get("submitStats") or {}).get("acSubmissionNum", [])}
    stats = [{"label": "Solved", "value": solved.get("All", 0)},
             {"label": "Easy", "value": solved.get("Easy", 0)},
             {"label": "Medium", "value": solved.get("Medium", 0)},
             {"label": "Hard", "value": solved.get("Hard", 0)}]
    rank = (user.get("profile") or {}).get("ranking")
    if rank:
        stats.append({"label": "Ranking", "value": rank})
    return _card("leetcode", h, stats, True)


async def _codeforces(c: httpx.AsyncClient, h: str) -> Dict[str, Any]:
    r = await c.get("https://codeforces.com/api/user.info", params={"handles": h}, headers=UA)
    d = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if d.get("status") != "OK":
        if r.status_code in (200, 400):
            return _card("codeforces", h, [], False, "No Codeforces user with that handle.")
        r.raise_for_status()
    u = d["result"][0]
    return _card("codeforces", h, [
        {"label": "Rating", "value": u.get("rating", "unrated")},
        {"label": "Max rating", "value": u.get("maxRating", "–")},
        {"label": "Rank", "value": u.get("rank", "unrated")},
    ], True)


FETCHERS = {"github": _github, "leetcode": _leetcode, "codeforces": _codeforces}


async def card(platform: str, handle: str, client: httpx.AsyncClient, force: bool = False) -> Dict[str, Any]:
    if not PLATFORMS[platform]["live"]:
        return _card(platform, handle, [], True, "No public API: shown as a link.")
    key, now = f"{platform}:{handle.lower()}", time.time()
    hit = _cache.get(key)
    if hit and (now - hit[0] < (MIN_REFRESH if force else TTL)):
        return hit[1]
    try:
        out = await FETCHERS[platform](client, handle)
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        if hit:                                                      # keep showing the last good numbers
            return {**hit[1], "note": "Couldn't refresh just now; showing the last numbers."}
        return _card(platform, handle, [], False, f"{PLATFORMS[platform]['name']} didn't answer. Try again in a minute.")
    _cache[key] = (now, out)
    return out


async def cards(handles: Mapping[str, str], force: bool = False, client: Optional[httpx.AsyncClient] = None) -> List[Dict[str, Any]]:
    own = client is None
    c = client or httpx.AsyncClient(timeout=8)
    try:
        order = [p for p in PLATFORMS if p in handles]
        return list(await asyncio.gather(*(card(p, handles[p], c, force) for p in order)))
    finally:
        if own:
            await c.aclose()


# ---------------------------------------------------------------- ownership verification
# The learner proves the profile is theirs by putting a short code in a public field they control; the server then reads
# that field from the platform itself. The code is derived from the account and handle, so nothing needs storing until
# the check succeeds, and changing the handle means verifying again.
VERIFY_FIELDS = {                                         # each platform's own name for its public "about" field
    "github": "your GitHub Bio (Your profile > Edit profile > Bio) or your profile README (the repository named after your username)",
    "leetcode": "your LeetCode README (Your profile > Edit Profile > README)",
    "codeforces": "your Codeforces Organization (Settings > Social > Organization)",
    "hackerrank": "your HackerRank About section (Your profile > Edit intro > About)",
    "codechef": "your CodeChef About Me (Edit Profile > About Me)",
}


def verification_code(secret: str, user_id: str, platform: str, handle: str) -> str:
    import hashlib
    import hmac
    digest = hmac.new(secret.encode(), f"{user_id}:{platform}:{handle.lower()}".encode(), hashlib.sha256).hexdigest()
    return f"kiddoo-{digest[:8]}"


async def _public_text(platform: str, h: str, c: httpx.AsyncClient) -> str:
    """The public, learner-editable text of a profile, straight from the platform."""
    if platform == "github":
        r = await c.get(f"https://api.github.com/users/{h}", headers={**UA, "Accept": "application/vnd.github+json"})
        r.raise_for_status()
        d = r.json()
        text = " ".join(str(d.get(k) or "") for k in ("bio", "name", "company", "blog"))
        readme = await c.get(f"https://api.github.com/repos/{h}/{h}/readme",          # the profile README, if there is one
                             headers={**UA, "Accept": "application/vnd.github.raw+json"})
        return text + (" " + readme.text if readme.status_code == 200 else "")
    if platform == "leetcode":
        q = "query($u: String!) { matchedUser(username: $u) { profile { aboutMe realName } } }"
        r = await c.post("https://leetcode.com/graphql", json={"query": q, "variables": {"u": h}},
                         headers={**UA, "Referer": "https://leetcode.com", "Content-Type": "application/json"})
        r.raise_for_status()
        p = (((r.json().get("data") or {}).get("matchedUser") or {}).get("profile") or {})
        return " ".join(str(p.get(k) or "") for k in ("aboutMe", "realName"))
    if platform == "codeforces":
        r = await c.get("https://codeforces.com/api/user.info", params={"handles": h}, headers=UA)
        d = r.json()
        if d.get("status") != "OK":
            return ""
        u = d["result"][0]
        return " ".join(str(u.get(k) or "") for k in ("organization", "firstName", "lastName", "city"))
    r = await c.get(PLATFORMS[platform]["url"].format(h=h), headers=UA, follow_redirects=True)   # no API: the public page
    r.raise_for_status()
    return r.text


async def verify(platform: str, handle: str, code: str, client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    own = client is None
    c = client or httpx.AsyncClient(timeout=10)
    try:
        text = await _public_text(platform, handle, c)
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return {"verified": False, "reason": f"Couldn't reach {PLATFORMS[platform]['name']} just now. Try again in a minute."}
    finally:
        if own:
            await c.aclose()
    if code.lower() in text.lower():
        return {"verified": True, "reason": None}
    return {"verified": False, "reason": f"The code isn't in {VERIFY_FIELDS[platform]} yet. Save it there, then check again (the platform can take a minute to update)."}
