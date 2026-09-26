"""Classify a coach turn before any retrieval or model call.

A greeting or a thank-you needs one short, friendly reply, not knowledge
retrieval, web research, tool calls and a profile diagnosis. Sending "hi"
through the full pipeline was slow (tens of seconds) and invited the model to
invent a personalised analysis nobody asked for. This module keeps that
decision deterministic and cheap.
"""

from __future__ import annotations

import re
from typing import Literal

TurnKind = Literal["smalltalk", "full"]

_SMALLTALK_WORDS = frozenset(
    {
        # greetings
        "hi",
        "hii",
        "hiii",
        "hello",
        "helo",
        "hey",
        "heyy",
        "heyyy",
        "hlo",
        "yo",
        "sup",
        "wassup",
        "whatsup",
        "hola",
        "namaste",
        "howdy",
        "greetings",
        "gm",
        "gn",
        "good",
        "morning",
        "afternoon",
        "evening",
        "night",
        "there",
        "again",
        # thanks and acknowledgements
        "thanks",
        "thank",
        "thx",
        "ty",
        "tysm",
        "thankyou",
        "you",
        "u",
        "so",
        "much",
        "a",
        "lot",
        "ok",
        "okay",
        "okk",
        "k",
        "kk",
        "cool",
        "nice",
        "great",
        "awesome",
        "perfect",
        "sure",
        "alright",
        "got",
        "it",
        "understood",
        "makes",
        "sense",
        "yes",
        "yeah",
        "yep",
        "yup",
        "no",
        "nope",
        "nah",
        "fine",
        "lol",
        "lmao",
        "haha",
        "hahaha",
        "hehe",
        "hmm",
        "hmmm",
        "wow",
        "bye",
        "goodbye",
        "see",
        "ya",
        "later",
        "cya",
        "take",
        "care",
        # address terms
        "coach",
        "bro",
        "buddy",
        "man",
        "mate",
        "dude",
        "sir",
        "friend",
        "algomemtor",
        "bot",
        "all",
        "everyone",
        "and",
    }
)

# Anchors: at least one of these must appear. A bare "ok", "yes" or "cool"
# usually answers something the coach just asked, so it keeps the full
# conversational context instead of getting a canned pleasantry.
_SMALLTALK_ANCHORS = frozenset(
    {
        "hi",
        "hii",
        "hiii",
        "hello",
        "helo",
        "hey",
        "heyy",
        "heyyy",
        "hlo",
        "yo",
        "sup",
        "wassup",
        "whatsup",
        "hola",
        "namaste",
        "howdy",
        "greetings",
        "gm",
        "gn",
        "morning",
        "afternoon",
        "evening",
        "thanks",
        "thank",
        "thx",
        "ty",
        "tysm",
        "thankyou",
        "lol",
        "lmao",
        "haha",
        "hahaha",
        "hehe",
        "bye",
        "goodbye",
        "cya",
    }
)

_META_QUESTIONS = re.compile(
    r"^(?:hi|hello|hey)?[\s,!]*(?:"
    r"how\s+are\s+(?:you|u)(?:\s+doing)?|how's\s+it\s+going|what's\s+up|"
    r"who\s+are\s+(?:you|u)|what\s+are\s+(?:you|u)|"
    r"what\s+can\s+(?:you|u)\s+do|what\s+do\s+(?:you|u)\s+do|"
    r"how\s+can\s+(?:you|u)\s+help(?:\s+me)?|what\s+can\s+(?:you|u)\s+help\s+(?:me\s+)?with|"
    r"are\s+(?:you|u)\s+(?:there|an?\s+ai|a\s+bot|real)"
    r")\s*\??$"
)


def _normalized(text: str) -> str:
    lowered = text.lower().replace("’", "'")
    # Emoji and punctuation carry no request.
    lowered = re.sub(r"[^\w\s']", " ", lowered)
    return " ".join(lowered.split())


# Mello, the on-page coach pet, sends the page the learner has open with
# this fixed opening line. It is context for the question, not pasted code or
# a problem statement, so it does not make a turn deep on its own.
PAGE_SNAPSHOT_PREFIX = "The learner has this AlgoMemtor page open"


def is_page_snapshot(text: str | None) -> bool:
    return bool(text) and text.lstrip().startswith(PAGE_SNAPSHOT_PREFIX)


def classify_turn(
    question: str,
    *,
    has_transient_context: bool = False,
    has_media: bool = False,
) -> TurnKind:
    """Return ``"smalltalk"`` only for short purely conversational messages."""
    if has_transient_context or has_media:
        return "full"
    stripped = question.strip()
    if not stripped or len(stripped) > 80:
        return "full" if stripped else "smalltalk"
    text = _normalized(stripped)
    if not text:
        # Only emoji or punctuation, e.g. "👋" or "?".
        return "smalltalk"
    if _META_QUESTIONS.match(text):
        return "smalltalk"
    words = text.split()
    if len(words) > 8:
        return "full"
    if all(word in _SMALLTALK_WORDS for word in words) and any(
        word in _SMALLTALK_ANCHORS for word in words
    ):
        return "smalltalk"
    return "full"


_COMPLEX = re.compile(
    r"\b(?:prove|proof|why|debug|bug|wrong answer|wa\b|tle|time limit|"
    r"runtime error|segfault|optimi[sz]e|complexity|editorial|solution|"
    r"how (?:do|can|should|to) (?:i )?solve|help (?:me )?solve|"
    r"approach|hint|stuck|code|implement|derive|dp state|transition|"
    r"counterexample|edge case|plan|roadmap|strategy)\b",
    re.IGNORECASE,
)


def is_complex_turn(
    question: str, *, has_transient_context: bool = False, has_media: bool = False
) -> bool:
    """Turns that deserve the configured (deeper) reasoning budget.

    Everything else (concept lookups, quick facts about the learner's own
    data) answers well with light reasoning and several times faster.
    """
    if has_transient_context or has_media:
        return True
    # A shared link is usually a specific problem or article to work through.
    if re.search(r"https?://", question, re.IGNORECASE):
        return True
    if len(question) > 400:
        return True
    return bool(_COMPLEX.search(question))


_WORLD_FACT = re.compile(
    r"^\s*(?:who|when|where|which|what year|in what year|how many|how much|"
    r"what is the capital|what was|who's|what's the (?:capital|population))\b",
    re.IGNORECASE,
)
_CP_OR_PERSONAL = re.compile(
    r"\b(?:my|me|i|i'm|i've|algorithm|complexity|array|graph|tree|dp|"
    r"dynamic programming|code|coding|program|problem|contest|rating|"
    r"codeforces|leetcode|codechef|cses|atcoder|submission|topic|solve|"
    r"solved|data structure|sort|search|heap|queue|stack|string|bit)\b",
    re.IGNORECASE,
)


def is_world_fact_question(question: str) -> bool:
    """A short factual question about the world rather than CP or the learner.

    A small local model recalls these much more reliably when it reasons
    first, and they are short enough that reasoning stays cheap.
    """
    return (
        len(question) <= 200
        and "http" not in question.lower()
        and bool(_WORLD_FACT.search(question))
        and not _CP_OR_PERSONAL.search(question)
    )
