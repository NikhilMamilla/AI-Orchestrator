"""Markdown parsing and hierarchical chunking.

Document -> section chunks (H2/H3 level, the "parent" returned for context) ->
passage chunks (~700 chars, the retrieval unit). Code fences are never split.
Every passage is embedded with its heading path as a prefix (contextual
retrieval) so "Time complexity" under "Binary Search" is distinguishable from the
same heading under "Quick Sort".
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Dict, List, Tuple

from .types import Chunk

MAX_PASSAGE_CHARS = 700
MIN_PASSAGE_CHARS = 120
_FM = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
_HEAD = re.compile(r"^(#{1,3})\s+(.*\S)\s*$")
_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9`(])")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[​‌‍﻿]", "", text)          # zero-width chars
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_front_matter(raw: str) -> Tuple[Dict[str, object], str]:
    """Tiny YAML subset: `key: value` and `key: [a, b]`. Avoids a YAML dependency
    (and YAML's code-execution footguns) for untrusted uploads."""
    m = _FM.match(raw)
    if not m:
        return {}, raw
    meta: Dict[str, object] = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            meta[k] = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k] = v.strip("'\"")
    return meta, raw[m.end():]


def _split_blocks(body: str) -> List[Tuple[str, str]]:
    """Return [(kind, text)] where kind in {'code','text'}; fenced code stays whole."""
    blocks: List[Tuple[str, str]] = []
    lines, buf, in_code = body.split("\n"), [], False
    for line in lines:
        if line.strip().startswith("```"):
            if in_code:
                buf.append(line)
                blocks.append(("code", "\n".join(buf)))
                buf, in_code = [], False
            else:
                if buf:
                    blocks.append(("text", "\n".join(buf).strip()))
                buf, in_code = [line], True
        elif in_code:
            buf.append(line)
        elif line.strip() == "":
            if buf:
                blocks.append(("text", "\n".join(buf).strip()))
                buf = []
        else:
            buf.append(line)
    if buf:
        blocks.append(("code" if in_code else "text", "\n".join(buf).strip()))
    return [(k, t) for k, t in blocks if t]


def _pack(blocks: List[Tuple[str, str]]) -> List[str]:
    """Greedily pack blocks into passages <= MAX chars, splitting long prose by sentence."""
    units: List[str] = []
    for kind, text in blocks:
        if kind == "code" or len(text) <= MAX_PASSAGE_CHARS:
            units.append(text)
        else:
            cur = ""
            for s in _SENT.split(text):
                if cur and len(cur) + len(s) + 1 > MAX_PASSAGE_CHARS:
                    units.append(cur)
                    cur = s
                else:
                    cur = f"{cur} {s}".strip()
            if cur:
                units.append(cur)
    passages: List[str] = []
    cur = ""
    for u in units:
        if cur and len(cur) + len(u) + 2 > MAX_PASSAGE_CHARS:
            passages.append(cur)
            cur = u
        else:
            cur = f"{cur}\n\n{u}".strip()
        if "```" in u and len(cur) >= MIN_PASSAGE_CHARS:   # keep code with its explanation, then cut
            passages.append(cur)
            cur = ""
    if cur:
        if passages and len(cur) < MIN_PASSAGE_CHARS:
            passages[-1] = f"{passages[-1]}\n\n{cur}"
        else:
            passages.append(cur)
    return passages


def chunk_markdown(doc_id: str, title: str, body: str, level: int, tags: List[str]
                   ) -> List[Chunk]:
    body = normalize(body)
    sections: List[Tuple[str, List[str]]] = []   # (heading_path, lines)
    stack: List[Tuple[int, str]] = []
    current_path, current_lines = title, []
    in_code = False
    for line in body.split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
        m = None if in_code else _HEAD.match(line)
        if m:
            depth, name = len(m.group(1)), m.group(2).strip()
            if depth == 1 and not stack and not "".join(current_lines).strip():
                title_override = name
                current_path = title_override
                stack = [(1, name)]
                continue
            if "".join(current_lines).strip():
                sections.append((current_path, current_lines))
            stack = [s for s in stack if s[0] < depth] + [(depth, name)]
            current_path = " > ".join(n for _, n in stack) if stack[0][0] == 1 \
                else f"{title} > " + " > ".join(n for _, n in stack)
            current_lines = []
        else:
            current_lines.append(line)
    if "".join(current_lines).strip():
        sections.append((current_path, current_lines))

    tag_str = " ".join(tags)
    chunks: List[Chunk] = []
    for si, (path, lines) in enumerate(sections):
        sec_text = "\n".join(lines).strip()
        sec_id = f"{doc_id}#s{si}"
        chunks.append(Chunk(id=sec_id, doc_id=doc_id, parent_id=None, kind="section",
                            heading_path=path, text=sec_text, ordinal=si, level=level, tags=tag_str))
        for pi, ptxt in enumerate(_pack(_split_blocks(sec_text))):
            chunks.append(Chunk(id=f"{sec_id}p{pi}", doc_id=doc_id, parent_id=sec_id, kind="passage",
                                heading_path=path, text=ptxt, ordinal=pi, level=level, tags=tag_str))
    return chunks


def embed_text(c: Chunk) -> str:
    """Text actually embedded: heading path prefix + passage (contextual retrieval)."""
    return f"{c.heading_path}\n{c.text}"
