from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    topic: str
    title: str
    content: str
    source: str = "AlgoMemtor CP/DSA reference"


KNOWLEDGE_CHUNKS: tuple[KnowledgeChunk, ...] = (
    KnowledgeChunk(
        "arrays-invariants",
        "arrays",
        "Array invariants and boundary checks",
        "For array problems, state the invariant before coding: what each index or window represents after every iteration. Check empty input, one element, duplicate values, and whether the right boundary is inclusive. Prefix sums turn a range sum into two lookups; update the invariant before moving either pointer.",
    ),
    KnowledgeChunk(
        "hashing-frequency",
        "hashing",
        "Hash maps for complements and frequency",
        "Use a hash map when the problem asks whether a complement, previous position, or frequency has appeared. Decide whether the map stores counts, the first index, or the best value. If order matters, preserve the earliest or latest index explicitly rather than relying on iteration order.",
    ),
    KnowledgeChunk(
        "sliding-window",
        "sliding-window",
        "Sliding-window decision pattern",
        "A sliding window works when expanding the right boundary and shrinking the left boundary preserves a monotone validity condition. Write the condition, the operation that restores it, and whether each pointer only moves forward. Non-monotone conditions usually need a different technique.",
    ),
    KnowledgeChunk(
        "binary-search-answer",
        "binary-search",
        "Binary search on a monotone answer",
        "Binary search is valid when feasibility changes in one direction across the ordered answer space. Define a predicate feasible(x), prove its monotonicity, choose a lower or upper bound convention, and test the first feasible and last infeasible values.",
    ),
    KnowledgeChunk(
        "graphs-bfs-dfs",
        "bfs-and-dfs",
        "BFS versus DFS",
        "BFS explores by distance layers and is the default for unweighted shortest paths. DFS is useful for reachability, components, cycle detection, and recursive state traversal. Mark visited state at the correct time and include disconnected starting vertices when the task asks about the whole graph.",
    ),
    KnowledgeChunk(
        "trees-recursion",
        "trees",
        "Tree recursion and returned state",
        "A tree recursion should specify what each call returns to its parent. Separate local work from child results, handle null children, and prove that each node is visited once. For path problems, distinguish a path that may be returned upward from a path that may pass through the current node.",
    ),
    KnowledgeChunk(
        "dynamic-programming",
        "dynamic-programming",
        "Dynamic programming state design",
        "Start DP by naming the smallest subproblem, its state variables, the transition, and the base cases. A useful state contains exactly the information needed for future decisions. Estimate state count times transition cost before optimizing memory.",
    ),
    KnowledgeChunk(
        "greedy-proof",
        "greedy",
        "Greedy choice and exchange argument",
        "A greedy algorithm needs a reason the local choice can be part of an optimal solution. Try an exchange argument: transform an optimal solution to include the greedy choice without making it worse. If that proof fails, consider DP or sorting by a different key.",
    ),
    KnowledgeChunk(
        "contest-debrief",
        "contest-strategy",
        "Contest debrief loop",
        "After a contest, classify each miss as knowledge gap, implementation bug, misread, time management, or verification failure. Re-solve one missed problem without the editor, then compare the intended invariant and complexity. Track the mistake category across contests rather than treating rating alone as diagnosis.",
    ),
    KnowledgeChunk(
        "complexity-basics",
        "complexity",
        "Complexity and constraint reading",
        "Read constraints before choosing a technique. Translate the largest input into an approximate operation budget, include sorting and nested loops, and account for memory. State worst-case time and space complexity and identify which term dominates.",
    ),
    KnowledgeChunk(
        "debugging-checklist",
        "debugging",
        "Competitive-programming debugging checklist",
        "When a solution fails, reproduce the smallest counterexample, inspect bounds and initialization, verify integer width, and compare the code invariant with the intended one. Separate wrong answer, runtime error, timeout, and compilation failure because each suggests a different next check.",
    ),
    KnowledgeChunk(
        "implementation-linked-lists",
        "linked-lists",
        "Linked-list pointer safety",
        "For linked lists, draw the pointers before changing links. Keep a stable predecessor or dummy head when deleting nodes, save next before rewiring, and test empty, singleton, head, tail, and adjacent-node cases.",
    ),
    KnowledgeChunk(
        "two-pointers",
        "two-pointers",
        "Two pointers and ordered scans",
        "Two pointers are useful when the input is ordered or when a left and right boundary can move without revisiting earlier positions. State what each pointer means, prove why moving one pointer cannot discard an answer, and test duplicates, equal values, and exhausted boundaries.",
    ),
    KnowledgeChunk(
        "heaps-priority-queues",
        "heaps-and-priority-queues",
        "Heaps and priority queues",
        "Use a heap when the next item must repeatedly be the smallest or largest among an evolving set. Decide whether a min-heap, max-heap, or bounded heap is needed, account for lazy deletion when entries become stale, and include heap construction plus each push and pop in the complexity.",
    ),
    KnowledgeChunk(
        "interview-algorithm-communication",
        "interviews",
        "Algorithm interview communication loop",
        "In an algorithm interview, clarify constraints and examples first, state a simple baseline, then improve it with a named invariant or data structure. Explain correctness before optimizing, give worst-case time and space, and finish with edge cases and a small mental trace. A clear trade-off is more useful than jumping to an unexplained pattern.",
    ),
    KnowledgeChunk(
        "cpp-contest-practicalities",
        "languages",
        "C++ contest implementation checks",
        "For C++, choose integer widths from the maximum intermediate value rather than the input type alone. Watch signed and unsigned comparisons, iterator invalidation, reference lifetimes, and recursion depth. Use a local comparator with a strict weak ordering and reserve capacity only when it helps a measured hot path.",
    ),
    KnowledgeChunk(
        "python-contest-practicalities",
        "languages",
        "Python contest implementation checks",
        "For Python, estimate whether input size fits the time budget before choosing nested loops. Use buffered input, avoid accidental quadratic string or list operations, and know the interfaces of heapq, bisect, deque, and set. Raise recursion limits only when the depth is understood; iterative traversal is often safer.",
    ),
    KnowledgeChunk(
        "java-contest-practicalities",
        "languages",
        "Java contest implementation checks",
        "For Java, choose long when products or prefix sums can exceed int, use a fast input path for large instances, and avoid boxing in tight loops when it changes memory or speed. Check comparator overflow and prefer ArrayDeque over legacy stack APIs for queue or stack behavior.",
    ),
)

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "based",
    "can",
    "for",
    "how",
    "i",
    "in",
    "is",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "which",
    "with",
    "you",
    "your",
}


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9-]*", value.lower())
        if token not in _STOP_WORDS and (len(token) >= 2 or token == "c")
    }


def retrieve_knowledge(query: str, limit: int = 8) -> list[KnowledgeChunk]:
    query_tokens = _tokens(query)
    if not query_tokens:
        return list(KNOWLEDGE_CHUNKS[:limit])
    scored: list[tuple[int, int, KnowledgeChunk]] = []
    for index, chunk in enumerate(KNOWLEDGE_CHUNKS):
        haystack = _tokens(f"{chunk.topic} {chunk.title} {chunk.content}")
        overlap = len(query_tokens & haystack)
        topic_bonus = 3 if chunk.topic in query_tokens else 0
        if overlap or topic_bonus:
            scored.append((overlap + topic_bonus, -index, chunk))
    scored.sort(reverse=True, key=lambda item: (item[0], item[1]))
    return [chunk for _, _, chunk in scored[:limit]]
