"""Strict, bounded and reviewable source patches for the NABOU Coding Agent.

No fuzzy matching. A unique exact anchor can insert small code without asking the
LLM to copy entire existing CSS/JS blocks; legacy old/new replacements still work.
"""
from __future__ import annotations

import json
import re

from nabou_coding_agent import AgentError

MAX_EDITS = 5
MAX_CHANGE_BYTES = 4000


def _safe_css_append(text: str) -> bool:
    """Only allow bounded, self-contained CSS; no external resources."""
    if not text.strip() or len(text) > 1200:
        return False
    if re.search(r"@import|@charset|@namespace|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding", text, re.I):
        return False
    if "/*" in text or "*/" in text or "<" in text or ">" in text:
        return False
    if text.count("{") != text.count("}") or text.count("{") < 1:
        return False
    depth = 0
    quote = None
    for ch in text:
        if quote:
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0 and quote is None and text.rstrip().endswith("}")


def parse_and_apply(raw: str, original: str, *, allow_css_append: bool = False) -> tuple[dict, str]:
    raw = raw.strip()
    if raw.startswith(chr(96) * 3):
        raw = re.sub(r"^" + chr(96) * 3 + r"(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*" + chr(96) * 3 + r"$", "", raw)
    try:
        proposal = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AgentError("AI_RESPONSE_NOT_JSON") from exc
    if not isinstance(proposal, dict) or not isinstance(proposal.get("edits"), list):
        raise AgentError("AI_RESPONSE_NOT_EDIT_LIST")
    edits = proposal["edits"]
    if not 1 <= len(edits) <= MAX_EDITS:
        raise AgentError("AI_PATCH_OUTSIDE_EDIT_BUDGET")

    output = original
    for index, item in enumerate(edits):
        if not isinstance(item, dict):
            raise AgentError("INVALID_EDIT_" + str(index))
        op = item.get("op", "replace")
        if op == "replace":
            old, new = item.get("old"), item.get("new")
            if (not isinstance(old, str) or not isinstance(new, str)
                    or not old or len(old) > 2000 or len(new) > 3000 or old == new):
                raise AgentError("INVALID_REPLACEMENT_" + str(index))
            if output.count(old) != 1:
                raise AgentError("EXACT_REPLACEMENT_ANCHOR_NOT_UNIQUE_" + str(index))
            output = output.replace(old, new, 1)
        elif op in ("insert_after", "insert_before"):
            anchor, text = item.get("anchor"), item.get("text")
            if (not isinstance(anchor, str) or not isinstance(text, str) or
                    not anchor or not text or len(anchor) > 600 or len(text) > 1200):
                raise AgentError("INVALID_INSERT_" + str(index))
            if output.count(anchor) != 1:
                raise AgentError("EXACT_INSERT_ANCHOR_NOT_UNIQUE_" + str(index))
            point = output.index(anchor) + (len(anchor) if op == "insert_after" else 0)
            output = output[:point] + text + output[point:]
        elif op == "append_css":
            text = item.get("text")
            if not allow_css_append or not isinstance(text, str) or not _safe_css_append(text):
                raise AgentError("INVALID_CSS_APPEND_" + str(index))
            if text.strip() in output:
                raise AgentError("DUPLICATE_CSS_APPEND_" + str(index))
            output = output.rstrip("\n") + "\n" + text.strip() + "\n"
        else:
            raise AgentError("UNSUPPORTED_PATCH_OPERATION_" + str(index))

    if output == original or abs(len(output) - len(original)) > MAX_CHANGE_BYTES or len(output) > 90_000:
        raise AgentError("PATCH_CHANGE_BUDGET_EXCEEDED")
    return proposal, output
