"""Helpers for authoring content compactly. Content is plain Python data -> served as JSON."""
from __future__ import annotations

from typing import Any

LEVELS = ("beginner", "intermediate", "advanced")


def mcq(question: str, options: list[str], answer: int, why: str, level: str = "beginner") -> dict[str, Any]:
    assert 0 <= answer < len(options), question
    assert level in LEVELS, level
    return {"q": question, "options": options, "answer": answer, "why": why, "level": level}


def iq(question: str, answer: str) -> dict[str, str]:
    """Interview question attached to a lesson (question + model answer)."""
    return {"q": question, "a": answer}


def lesson(id: str, module: str, title: str, minutes: int, level: str, prereqs: list[str],
           summary: str, body: str, quiz: list[dict], interview: list[dict],
           exercises: list[str] | None = None) -> dict[str, Any]:
    assert level in LEVELS, id
    return {
        "id": id, "module": module, "title": title, "minutes": minutes, "level": level,
        "prereqs": prereqs, "summary": summary, "body": body.strip("\n"),
        "quiz": quiz, "interview": interview, "exercises": exercises or [],
    }
