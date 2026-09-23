"""Read-only tools the coach agent uses to query the learner's own data.

Express assembles an owner-scoped ``workspace`` (complete solved history,
submissions, contests, rating changes, roadmap topics, and a bounded pool of
trusted practice candidates). The model never receives that workspace
wholesale; it asks these tools for the rows a question needs. Every tool is a
pure, bounded query over data already authorized for this request, so a tool
call cannot reach another learner, the network, or the database.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

MAX_ROWS = 60
_TAG_ALIASES = {
    "dp": "dynamic programming",
    "bs": "binary search",
    "ds": "data structures",
    "dsu": "dsu",
    "union find": "dsu",
    "graph": "graphs",
    "tree": "trees",
    "string": "strings",
    "math": "math",
    "number theory": "number theory",
    "nt": "number theory",
    "bit": "bitmasks",
    "bitmask": "bitmasks",
    "two pointer": "two pointers",
    "sliding window": "two pointers",
    "segment tree": "data structures",
    "prefix sum": "prefix sums",
    "combinatorics": "combinatorics",
    "geometry": "geometry",
    "shortest path": "shortest paths",
    "dijkstra": "shortest paths",
    "bfs": "graphs",
    "dfs": "dfs and similar",
}

ToolDeclaration = dict[str, Any]


def _norm(value: object) -> str:
    return re.sub(r"[\s_-]+", " ", str(value)).strip().lower()


def _rows(workspace: dict[str, object], key: str) -> list[dict[str, Any]]:
    value = workspace.get(key)
    return (
        [item for item in value if isinstance(item, dict)]
        if isinstance(value, list)
        else []
    )


def _number(value: object) -> float | None:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else None
    )


def _int_arg(args: dict[str, Any], key: str, default: int, low: int, high: int) -> int:
    value = args.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return default
    return max(low, min(high, int(value)))


def _date_window(args: dict[str, Any], now: datetime) -> tuple[str | None, str | None]:
    since = args.get("since") if isinstance(args.get("since"), str) else None
    until = args.get("until") if isinstance(args.get("until"), str) else None
    days = args.get("days")
    if isinstance(days, int | float) and not isinstance(days, bool) and days > 0:
        since = (now - timedelta(days=min(int(days), 3_650))).date().isoformat()
    # ISO-8601 strings sort chronologically, so a prefix comparison is enough.
    if since is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", since):
        since = None
    if until is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", until):
        until = None
    if until is not None and len(until) == 10:
        until = until + "T23:59:59.999Z"
    return since, until


def _in_window(value: object, since: str | None, until: str | None) -> bool:
    if since is None and until is None:
        return True
    if not isinstance(value, str):
        return False
    return (since is None or value >= since) and (until is None or value <= until)


def _tag_query(value: object) -> tuple[str, ...] | None:
    """The learner's wording plus its canonical alias ("dp" and "dynamic programming")."""
    if not isinstance(value, str) or not value.strip():
        return None
    query = _norm(value)
    alias = _TAG_ALIASES.get(query, query)
    return (query,) if alias == query else (query, alias)


def _label_matches(label: str, queries: tuple[str, ...]) -> bool:
    # Short labels ("dp", "bs") must match exactly; longer ones may match as
    # substrings so "binary search" finds "binary-search".
    return any(
        label == query
        or (len(label) > 3 and len(query) > 3 and (query in label or label in query))
        for query in queries
    )


def _matches_tag(row: dict[str, Any], queries: tuple[str, ...] | None) -> bool:
    if queries is None:
        return True
    labels = [
        _norm(tag)
        for key in ("tags", "topics")
        for tag in (row.get(key) if isinstance(row.get(key), list) else [])
    ]
    return any(_label_matches(label, queries) for label in labels if label)


def _matches_text(row: dict[str, Any], value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return True
    needle = _norm(value)
    return needle in _norm(row.get("title", "")) or needle in _norm(
        row.get("externalId", "")
    )


def _provider_ok(row: dict[str, Any], value: object) -> bool:
    return (
        not isinstance(value, str) or not value or row.get("provider") == value.lower()
    )


def _rating_ok(row: dict[str, Any], args: dict[str, Any]) -> bool:
    low = _number(args.get("minRating"))
    high = _number(args.get("maxRating"))
    if low is None and high is None:
        return True
    rating = _number(row.get("rating"))
    if rating is None:
        return False
    return (low is None or rating >= low) and (high is None or rating <= high)


def _difficulty_ok(row: dict[str, Any], value: object) -> bool:
    return not isinstance(value, str) or not value or row.get("difficulty") == value


def _compact(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {key: row[key] for key in keys if row.get(key) not in (None, [], "")}


_VERDICT_GROUPS = {
    "accepted": ("ok", "accepted", "ac"),
    "wrong_answer": ("wrong", "wa"),
    "time_limit": ("time", "tle"),
    "memory_limit": ("memory", "mle"),
    "runtime_error": ("runtime", "re"),
    "compile_error": ("compil", "ce"),
}


def verdict_group(verdict: object, accepted: object = None) -> str:
    if accepted is True:
        return "accepted"
    text = _norm(verdict)
    for group, needles in _VERDICT_GROUPS.items():
        if any(
            text == needle or (len(needle) > 2 and text.startswith(needle))
            for needle in needles
        ):
            return group
    return "other"


def tool_declarations(
    *, knowledge: bool, web: bool, refresh: bool = False
) -> list[ToolDeclaration]:
    common_filters = {
        "provider": {
            "type": "string",
            "enum": ["codeforces", "codechef", "leetcode", "cses"],
            "description": "Restrict to one platform.",
        },
        "topic": {
            "type": "string",
            "description": "Tag or topic, e.g. 'dp', 'graphs', 'binary search'.",
        },
        "minRating": {"type": "number", "description": "Minimum problem rating."},
        "maxRating": {"type": "number", "description": "Maximum problem rating."},
        "days": {"type": "integer", "description": "Only the last N days."},
        "since": {
            "type": "string",
            "description": "ISO date lower bound (YYYY-MM-DD).",
        },
        "until": {
            "type": "string",
            "description": "ISO date upper bound (YYYY-MM-DD).",
        },
        "limit": {"type": "integer", "description": "Rows to return (max 60)."},
    }
    declarations: list[ToolDeclaration] = [
        {
            "name": "get_profile_overview",
            "description": (
                "Learner's complete profile digest: linked accounts with handles, "
                "ranks, current/max ratings, totals by platform, rating bands, "
                "top and weak tags, verdict mix, languages, streaks, contests."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "query_solved_problems",
            "description": (
                "List and count problems the learner has solved, with title, "
                "rating, tags, and solve date. Use for 'how many X did I solve', "
                "'my hardest problems', 'what did I solve last week'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    **common_filters,
                    "search": {"type": "string", "description": "Title or ID text."},
                    "sort": {
                        "type": "string",
                        "enum": ["recent", "oldest", "rating_desc", "rating_asc"],
                    },
                },
            },
        },
        {
            "name": "query_submissions",
            "description": (
                "Submission history with verdicts, languages and times, plus a "
                "verdict breakdown. Use for mistakes, WA/TLE patterns, a specific "
                "problem's attempts, or language usage."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    **common_filters,
                    "verdict": {
                        "type": "string",
                        "enum": [
                            "accepted",
                            "rejected",
                            "wrong_answer",
                            "time_limit",
                            "memory_limit",
                            "runtime_error",
                            "compile_error",
                        ],
                    },
                    "search": {
                        "type": "string",
                        "description": "Problem title or ID text.",
                    },
                },
            },
        },
        {
            "name": "query_unsolved_attempts",
            "description": (
                "Problems the learner tried but has not solved yet, with failed "
                "submission counts. Use for 'unfinished problems' or upsolving."
            ),
            "parameters": {"type": "object", "properties": common_filters},
        },
        {
            "name": "get_contest_history",
            "description": "Contest participations with name, rank, score and rating change.",
            "parameters": {
                "type": "object",
                "properties": {
                    "provider": common_filters["provider"],
                    "days": common_filters["days"],
                    "limit": common_filters["limit"],
                    "sort": {
                        "type": "string",
                        "enum": ["recent", "best_rank", "best_delta", "worst_delta"],
                    },
                },
            },
        },
        {
            "name": "get_rating_history",
            "description": "Rating change series per platform with current, peak, lowest and trend.",
            "parameters": {
                "type": "object",
                "properties": {
                    "provider": common_filters["provider"],
                    "days": common_filters["days"],
                },
            },
        },
        {
            "name": "get_topic_breakdown",
            "description": (
                "Per-tag statistics: solved count, rating range, failed attempts, "
                "last practice date, and the roadmap assessment. Omit topic for "
                "all tags."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": common_filters["topic"],
                    "provider": common_filters["provider"],
                },
            },
        },
        {
            "name": "get_activity_summary",
            "description": "Solves and submissions per day/week, active days and streaks for a window.",
            "parameters": {
                "type": "object",
                "properties": {"days": common_filters["days"]},
            },
        },
        {
            "name": "find_practice_problems",
            "description": (
                "Trusted, unsolved practice candidates from AlgoMemtor's catalog. "
                "Returns exact IDs to put in presentation.problemIds. Only these "
                "IDs (or roadmap problems in context) may be recommended."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "provider": common_filters["provider"],
                    "topic": common_filters["topic"],
                    "minRating": common_filters["minRating"],
                    "maxRating": common_filters["maxRating"],
                    "difficulty": {
                        "type": "string",
                        "enum": ["easy", "medium", "hard"],
                    },
                    "limit": {"type": "integer", "description": "Max 10."},
                },
            },
        },
    ]
    if knowledge:
        declarations.append(
            {
                "name": "search_knowledge",
                "description": (
                    "Search AlgoMemtor's curated CP/DSA knowledge base "
                    "(techniques, invariants, pitfalls, templates)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            }
        )
    if refresh:
        declarations.append(
            {
                "name": "refresh_platform_data",
                "description": (
                    "Fetch the learner's newest data from one platform right now "
                    "(latest submissions and updated totals). Use only when "
                    "activityDigest and the query tools lack what the question "
                    "needs, or when the learner asks about something very recent "
                    "(today, just now, their last submission). At most once per "
                    "platform per turn."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "provider": {
                            "type": "string",
                            "enum": ["codeforces", "codechef", "leetcode", "cses"],
                        }
                    },
                    "required": ["provider"],
                },
            }
        )
    if web:
        declarations.append(
            {
                "name": "web_search",
                "description": (
                    "De-identified public web search for CP/DSA facts, editorial "
                    "ideas, platform rules, or problem pages. Never include the "
                    "learner's handle, name, rating, or private data in the query."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            }
        )
    return declarations


class WorkspaceTools:
    def __init__(
        self,
        workspace: dict[str, object] | None,
        *,
        knowledge_search: Callable[[str], Awaitable[list[dict[str, Any]]]]
        | None = None,
        web_search: Callable[[str], Awaitable[dict[str, Any]]] | None = None,
        platform_refresh: Callable[[str], Awaitable[dict[str, Any]]] | None = None,
        now: datetime | None = None,
    ) -> None:
        self.workspace = workspace or {}
        self.knowledge_search = knowledge_search
        self.web_search = web_search
        self.platform_refresh = platform_refresh
        self.refreshed: set[str] = set()
        self.now = now or datetime.now(UTC)

    async def execute(self, name: str, args: object) -> dict[str, Any]:
        arguments = args if isinstance(args, dict) else {}
        handlers: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
            "get_profile_overview": self.profile_overview,
            "query_solved_problems": self.solved_problems,
            "query_submissions": self.submissions,
            "query_unsolved_attempts": self.unsolved_attempts,
            "get_contest_history": self.contest_history,
            "get_rating_history": self.rating_history,
            "get_topic_breakdown": self.topic_breakdown,
            "get_activity_summary": self.activity_summary,
            "find_practice_problems": self.practice_problems,
        }
        try:
            if name in handlers:
                return handlers[name](arguments)
            if name == "refresh_platform_data" and self.platform_refresh is not None:
                provider = arguments.get("provider")
                if provider not in {"codeforces", "codechef", "leetcode", "cses"}:
                    return {"error": "Choose one linked platform."}
                if provider in self.refreshed:
                    return {"error": "This platform was already refreshed this turn."}
                self.refreshed.add(provider)
                return await self.platform_refresh(provider)
            query = arguments.get("query")
            if not isinstance(query, str) or not query.strip():
                return {"error": "A non-empty query is required."}
            if name == "search_knowledge" and self.knowledge_search is not None:
                return {"results": await self.knowledge_search(query.strip()[:300])}
            if name == "web_search" and self.web_search is not None:
                return await self.web_search(query.strip()[:300])
        except (TypeError, ValueError, KeyError) as error:
            return {"error": f"Tool failed: {type(error).__name__}"}
        return {"error": f"Unknown tool: {name}"}

    # -- profile -----------------------------------------------------------

    def profile_overview(self, _args: dict[str, Any]) -> dict[str, Any]:
        digest = self.workspace.get("digest")
        return {
            "digest": digest if isinstance(digest, dict) else {},
            "accounts": _rows(self.workspace, "accounts"),
            "dataNote": self.workspace.get("dataNote"),
        }

    # -- solved / attempts -------------------------------------------------

    def _filtered(
        self, key: str, args: dict[str, Any], date_key: str
    ) -> list[dict[str, Any]]:
        since, until = _date_window(args, self.now)
        topic = _tag_query(args.get("topic"))
        return [
            row
            for row in _rows(self.workspace, key)
            if _provider_ok(row, args.get("provider"))
            and _matches_tag(row, topic)
            and _rating_ok(row, args)
            and _matches_text(row, args.get("search"))
            and _in_window(row.get(date_key), since, until)
        ]

    def solved_problems(self, args: dict[str, Any]) -> dict[str, Any]:
        rows = self._filtered("solved", args, "solvedAt")
        sort = args.get("sort", "recent")
        if sort in {"rating_desc", "rating_asc"}:
            rows.sort(
                key=lambda row: _number(row.get("rating")) or -1,
                reverse=sort == "rating_desc",
            )
        else:
            rows.sort(
                key=lambda row: str(row.get("solvedAt") or ""), reverse=sort != "oldest"
            )
        limit = _int_arg(args, "limit", 25, 1, MAX_ROWS)
        ratings = [
            value for row in rows if (value := _number(row.get("rating"))) is not None
        ]
        by_provider = Counter(str(row.get("provider")) for row in rows)
        return {
            "totalMatching": len(rows),
            "byProvider": dict(by_provider),
            "ratingSummary": (
                {
                    "min": min(ratings),
                    "max": max(ratings),
                    "average": round(sum(ratings) / len(ratings)),
                    "rated": len(ratings),
                }
                if ratings
                else None
            ),
            "items": [
                _compact(
                    row,
                    (
                        "id",
                        "title",
                        "rating",
                        "difficulty",
                        "tags",
                        "solvedAt",
                        "source",
                    ),
                )
                for row in rows[:limit]
            ],
            "note": "Undated solves are excluded when a date filter is used.",
        }

    def unsolved_attempts(self, args: dict[str, Any]) -> dict[str, Any]:
        rows = self._filtered("attempted", args, "lastAttemptAt")
        rows.sort(key=lambda row: str(row.get("lastAttemptAt") or ""), reverse=True)
        limit = _int_arg(args, "limit", 20, 1, MAX_ROWS)
        return {
            "totalMatching": len(rows),
            "items": [
                _compact(
                    row,
                    (
                        "id",
                        "title",
                        "rating",
                        "tags",
                        "failedSubmissions",
                        "lastVerdict",
                        "lastAttemptAt",
                    ),
                )
                for row in rows[:limit]
            ],
        }

    def submissions(self, args: dict[str, Any]) -> dict[str, Any]:
        rows = self._filtered("submissions", args, "at")
        wanted = args.get("verdict")
        if isinstance(wanted, str) and wanted:
            rows = [
                row
                for row in rows
                if (
                    verdict_group(row.get("verdict"), row.get("accepted")) != "accepted"
                    if wanted == "rejected"
                    else verdict_group(row.get("verdict"), row.get("accepted"))
                    == wanted
                )
            ]
        rows.sort(key=lambda row: str(row.get("at") or ""), reverse=True)
        breakdown = Counter(
            verdict_group(row.get("verdict"), row.get("accepted")) for row in rows
        )
        languages = Counter(str(row["language"]) for row in rows if row.get("language"))
        limit = _int_arg(args, "limit", 25, 1, MAX_ROWS)
        total = len(rows)
        return {
            "totalMatching": total,
            "verdictBreakdown": dict(breakdown),
            "acceptanceRate": round(breakdown["accepted"] / total * 100, 1)
            if total
            else None,
            "languages": dict(languages.most_common(6)),
            "items": [
                _compact(
                    row, ("id", "title", "verdict", "language", "at", "rating", "tags")
                )
                for row in rows[:limit]
            ],
            "note": self.workspace.get("submissionNote"),
        }

    # -- contests / rating ---------------------------------------------------

    def contest_history(self, args: dict[str, Any]) -> dict[str, Any]:
        since, until = _date_window(args, self.now)
        rows = [
            row
            for row in _rows(self.workspace, "contests")
            if _provider_ok(row, args.get("provider"))
            and _in_window(row.get("at"), since, until)
        ]
        sort = args.get("sort", "recent")
        if sort == "best_rank":
            rows.sort(key=lambda row: _number(row.get("rank")) or float("inf"))
        elif sort in {"best_delta", "worst_delta"}:
            rows = [row for row in rows if _number(row.get("delta")) is not None]
            rows.sort(
                key=lambda row: _number(row.get("delta")) or 0,
                reverse=sort == "best_delta",
            )
        else:
            rows.sort(key=lambda row: str(row.get("at") or ""), reverse=True)
        deltas = [
            value for row in rows if (value := _number(row.get("delta"))) is not None
        ]
        ranks = [
            value for row in rows if (value := _number(row.get("rank"))) is not None
        ]
        limit = _int_arg(args, "limit", 20, 1, MAX_ROWS)
        return {
            "totalMatching": len(rows),
            "summary": {
                "averageDelta": round(sum(deltas) / len(deltas), 1) if deltas else None,
                "positiveContests": sum(1 for value in deltas if value > 0),
                "negativeContests": sum(1 for value in deltas if value < 0),
                "bestRank": int(min(ranks)) if ranks else None,
                "medianRank": int(sorted(ranks)[len(ranks) // 2]) if ranks else None,
            },
            "items": [
                _compact(
                    row,
                    (
                        "provider",
                        "contestId",
                        "name",
                        "rank",
                        "score",
                        "delta",
                        "oldRating",
                        "newRating",
                        "solved",
                        "at",
                    ),
                )
                for row in rows[:limit]
            ],
        }

    def rating_history(self, args: dict[str, Any]) -> dict[str, Any]:
        since, until = _date_window(args, self.now)
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in _rows(self.workspace, "ratings"):
            if _provider_ok(row, args.get("provider")) and _in_window(
                row.get("at"), since, until
            ):
                grouped[str(row.get("provider"))].append(row)
        result: dict[str, Any] = {}
        for provider, rows in grouped.items():
            rows.sort(key=lambda row: str(row.get("at") or ""))
            values = [
                value
                for row in rows
                if (value := _number(row.get("newRating"))) is not None
            ]
            if not values:
                continue
            last_five = values[-5:]
            result[provider] = {
                "current": values[-1],
                "peak": max(values),
                "lowest": min(values),
                "ratedContests": len(values),
                "changeOverWindow": values[-1]
                - (_number(rows[0].get("oldRating")) or values[0]),
                "lastFiveTrend": last_five[-1] - last_five[0]
                if len(last_five) > 1
                else 0,
                "series": [
                    _compact(
                        row,
                        (
                            "at",
                            "contestName",
                            "oldRating",
                            "newRating",
                            "delta",
                            "percentile",
                        ),
                    )
                    for row in rows[-40:]
                ],
            }
        return (
            {"byProvider": result}
            if result
            else {"byProvider": {}, "note": "No rated contests observed."}
        )

    # -- topics / activity ---------------------------------------------------

    def topic_breakdown(self, args: dict[str, Any]) -> dict[str, Any]:
        topic = _tag_query(args.get("topic"))
        provider = args.get("provider")
        stats: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "solved": 0,
                "ratings": [],
                "failedSubmissions": 0,
                "lastSolvedAt": None,
            }
        )
        for row in _rows(self.workspace, "solved"):
            if not _provider_ok(row, provider):
                continue
            for tag in row.get("tags") or []:
                entry = stats[_norm(tag)]
                entry["solved"] += 1
                if (rating := _number(row.get("rating"))) is not None:
                    entry["ratings"].append(rating)
                solved_at = row.get("solvedAt")
                if (
                    isinstance(solved_at, str)
                    and (entry["lastSolvedAt"] or "") < solved_at
                ):
                    entry["lastSolvedAt"] = solved_at
        for row in _rows(self.workspace, "submissions"):
            if not _provider_ok(row, provider) or row.get("accepted") is True:
                continue
            for tag in row.get("tags") or []:
                stats[_norm(tag)]["failedSubmissions"] += 1
        roadmap = {
            _norm(item.get("name", item.get("topic", ""))): item
            for item in _rows(self.workspace, "topics")
        }
        items = []
        for tag, entry in stats.items():
            if topic is not None and not _label_matches(tag, topic):
                continue
            ratings = entry.pop("ratings")
            assessment = roadmap.get(tag)
            items.append(
                {
                    "tag": tag,
                    **entry,
                    **(
                        {
                            "ratingRange": [min(ratings), max(ratings)],
                            "averageRating": round(sum(ratings) / len(ratings)),
                        }
                        if ratings
                        else {}
                    ),
                    **(
                        {
                            "roadmap": _compact(
                                assessment,
                                (
                                    "lane",
                                    "assessment",
                                    "score",
                                    "confidence",
                                    "manualStatus",
                                ),
                            )
                        }
                        if assessment
                        else {}
                    ),
                }
            )
        items.sort(key=lambda item: item["solved"], reverse=True)
        if topic is not None and not items:
            match = next(
                (item for key, item in roadmap.items() if _label_matches(key, topic)),
                None,
            )
            return {
                "items": [],
                "roadmap": match,
                "note": "No solved or failed problems observed for this tag.",
            }
        return {"totalTags": len(items), "items": items[:40]}

    def activity_summary(self, args: dict[str, Any]) -> dict[str, Any]:
        days = _int_arg(args, "days", 30, 1, 730)
        since = (self.now - timedelta(days=days)).date().isoformat()
        solved_by_day: Counter[str] = Counter()
        subs_by_day: Counter[str] = Counter()
        for row in _rows(self.workspace, "solved"):
            at = row.get("solvedAt")
            if isinstance(at, str) and at[:10] >= since:
                solved_by_day[at[:10]] += 1
        for row in _rows(self.workspace, "submissions"):
            at = row.get("at")
            if isinstance(at, str) and at[:10] >= since:
                subs_by_day[at[:10]] += 1
        active = sorted(set(solved_by_day) | set(subs_by_day))
        weekly: Counter[str] = Counter()
        for day, count in solved_by_day.items():
            year, week, _ = datetime.fromisoformat(day).isocalendar()
            weekly[f"{year}-W{week:02d}"] += count
        weekday = Counter(
            datetime.fromisoformat(day).strftime("%A")
            for day, count in solved_by_day.items()
            for _ in range(count)
        )
        return {
            "windowDays": days,
            "solved": sum(solved_by_day.values()),
            "submissions": sum(subs_by_day.values()),
            "activeDays": len(active),
            "solvedPerWeek": dict(sorted(weekly.items())),
            "busiestWeekdays": dict(weekday.most_common(3)),
            "dailySolved": dict(sorted(solved_by_day.items())[-60:]),
            "streaks": (self.workspace.get("digest") or {}).get("activity")
            if isinstance(self.workspace.get("digest"), dict)
            else None,
            "note": "Dates use UTC; provider history can be partial.",
        }

    def practice_problems(self, args: dict[str, Any]) -> dict[str, Any]:
        topic = _tag_query(args.get("topic"))
        rows = [
            row
            for row in _rows(self.workspace, "practicePool")
            if _provider_ok(row, args.get("provider"))
            and _matches_tag(row, topic)
            and _rating_ok(row, args)
            and _difficulty_ok(row, args.get("difficulty"))
        ]
        limit = _int_arg(args, "limit", 6, 1, 10)
        return {
            "totalMatching": len(rows),
            "items": [
                _compact(
                    row, ("id", "title", "rating", "difficulty", "tags", "solvedCount")
                )
                for row in rows[:limit]
            ],
            "note": (
                "Recommend only these exact IDs. If nothing matches, widen the "
                "rating range or topic, or say the catalog has no match."
            ),
        }


_PERSONAL = re.compile(r"\b(my|me|mine|i|i'm|i've|am i|have i|did i)\b", re.IGNORECASE)
_PREFETCH_RULES: tuple[tuple[re.Pattern[str], str, dict[str, Any], bool], ...] = (
    (
        re.compile(
            r"\b(contests?|rounds?|ranks?|ranking|div\.?\s*[1-4])\b", re.IGNORECASE
        ),
        "get_contest_history",
        {"limit": 10},
        True,
    ),
    (
        re.compile(
            r"\b(rating|elo|rated|expert|specialist|pupil|candidate master)\b",
            re.IGNORECASE,
        ),
        "get_rating_history",
        {},
        True,
    ),
    (
        re.compile(
            r"\b(wrong|wa|tle|mle|mistakes?|fail(?:ed|ing|s)?|verdicts?|errors?|stuck|upsolv\w*|unsolved)\b",
            re.IGNORECASE,
        ),
        "query_submissions",
        {"verdict": "rejected", "limit": 20},
        True,
    ),
    (
        re.compile(
            r"\b(upsolv\w*|unsolved|unfinished|attempted|gave up)\b", re.IGNORECASE
        ),
        "query_unsolved_attempts",
        {"limit": 15},
        True,
    ),
    (
        re.compile(r"\b(solved|hardest|how many|count|history|list)\b", re.IGNORECASE),
        "query_solved_problems",
        {"limit": 20},
        True,
    ),
    (
        re.compile(
            r"\b(today|yesterday|this week|last week|this month|streak|consisten\w*|active|daily|routine)\b",
            re.IGNORECASE,
        ),
        "get_activity_summary",
        {"days": 30},
        True,
    ),
    (
        re.compile(
            r"\b(weak(?:ness|est)?|strong(?:est)?|topics?|tags?|good at|bad at|improve)\b",
            re.IGNORECASE,
        ),
        "get_topic_breakdown",
        {},
        True,
    ),
    (
        re.compile(
            r"\b(recommend|suggest|practice|next problems?|problems? (?:to|for|at)|give me .{0,30}problems?|what should i solve)\b",
            re.IGNORECASE,
        ),
        "find_practice_problems",
        {"limit": 10},
        False,
    ),
)


def prefetch_plan(question: str, limit: int = 4) -> list[tuple[str, dict[str, Any]]]:
    """Deterministic data lookups for obviously personal questions.

    Lighter models sometimes answer profile questions without calling a tool.
    Running the evident queries up front grounds the first step in real rows
    and usually saves a whole tool round (one billable request).
    """
    personal = bool(_PERSONAL.search(question))
    plan: list[tuple[str, dict[str, Any]]] = []
    for pattern, name, args, needs_personal in _PREFETCH_RULES:
        if (
            (personal or not needs_personal)
            and pattern.search(question)
            and all(existing != name for existing, _ in plan)
        ):
            plan.append((name, dict(args)))
        if len(plan) == limit:
            break
    return plan
