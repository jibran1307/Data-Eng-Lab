"""Shared helper for the interview question bank.

Q(topic, type, level, question, model_answer, keywords, hints)
  keywords: list of "synonym|synonym|..." strings; each string is one concept group, satisfied if ANY synonym appears.
"""
from __future__ import annotations

import hashlib
from typing import Any

TOPICS = ["sql", "python", "fundamentals", "etl", "warehousing", "spark", "orchestration", "azure",
          "streaming", "modeling", "scenario", "design", "troubleshooting", "tools"]
TYPES = ("concept", "sql", "python", "scenario", "design", "troubleshoot")
LEVELS = ("beginner", "intermediate", "advanced", "expert")

def Q(topic: str, qtype: str, level: str, q: str, answer: str, kw: list[str], hints: list[str] | None = None) -> dict[str, Any]:
    assert topic in TOPICS and qtype in TYPES and level in LEVELS, (topic, qtype, level, q)
    # Content-hash ids stay stable when questions are added or reordered (history tracking depends on this).
    digest = hashlib.sha1(q.encode("utf-8")).hexdigest()[:8]
    item: dict[str, Any] = {
        "id": f"{topic}-{digest}", "topic": topic, "type": qtype, "level": level,
        "q": q, "answer": answer, "keywords": [[s.strip() for s in g.split("|") if s.strip()] for g in kw],
    }
    if hints:
        item["hints"] = hints
    return item
