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
    KnowledgeChunk(
        "segment-tree",
        "segment-trees",
        "Segment tree range aggregates",
        "A segment tree stores an associative aggregate for each interval. Build in O(n), answer a range query in O(log n), and update a point in O(log n). Define no-overlap, full-overlap, and partial-overlap cases before coding.",
    ),
    KnowledgeChunk(
        "fenwick-tree",
        "fenwick-trees",
        "Fenwick tree prefix sums",
        "A Fenwick tree stores partial sums using the least significant set bit. Prefix queries and point updates are O(log n); convert a range query to prefix(r)-prefix(l-1), and use coordinate compression when values are sparse.",
    ),
    KnowledgeChunk(
        "sparse-table",
        "sparse-tables",
        "Sparse table idempotent queries",
        "Sparse tables precompute 2^k intervals in O(n log n). They answer static minimum, maximum, or gcd queries in O(1) when the operation is idempotent; updates require another structure.",
    ),
    KnowledgeChunk(
        "dsu-union-find",
        "dsu",
        "Disjoint set union",
        "Union-find maintains components with parent links, path compression, and union by size or rank. Each operation is near constant amortized time; use it for connectivity, cycle detection, and Kruskal's algorithm.",
    ),
    KnowledgeChunk(
        "tries",
        "tries",
        "Trie prefix queries",
        "A trie represents strings by shared prefixes. Insert and lookup take O(length); store terminal markers and counts, and choose an array or map child representation according to the alphabet.",
    ),
    KnowledgeChunk(
        "monotonic-stack",
        "monotonic-stacks",
        "Monotonic stack",
        "Maintain increasing or decreasing candidates so each item is pushed and popped once. This turns next greater, previous smaller, histogram, and contribution problems into linear scans.",
    ),
    KnowledgeChunk(
        "monotonic-queue",
        "monotonic-queues",
        "Monotonic deque windows",
        "A monotonic deque keeps only candidates that can become the minimum or maximum in the current window. Remove expired indices from the front and dominated values from the back.",
    ),
    KnowledgeChunk(
        "dijkstra",
        "shortest-paths",
        "Dijkstra shortest paths",
        "Dijkstra is valid with non-negative edge weights. Pop the smallest tentative distance, skip stale heap entries, and relax outgoing edges; complexity is O((V+E) log V) with a binary heap.",
    ),
    KnowledgeChunk(
        "bellman-ford",
        "shortest-paths",
        "Bellman-Ford and negative edges",
        "Relax every edge V-1 times to find shortest paths with negative edges. A further relaxation identifies a reachable negative cycle; early-stop when a pass makes no changes.",
    ),
    KnowledgeChunk(
        "floyd-warshall",
        "shortest-paths",
        "Floyd-Warshall all pairs",
        "Floyd-Warshall updates dist[i][j] through each intermediate k. Keep the k loop outermost, use a large finite sentinel, and avoid overflow when adding unreachable values.",
    ),
    KnowledgeChunk(
        "kruskal-mst",
        "minimum-spanning-trees",
        "Kruskal minimum spanning tree",
        "Sort edges by weight and use DSU to accept an edge only when it joins two components. The accepted V-1 edges form a minimum spanning forest or tree.",
    ),
    KnowledgeChunk(
        "prim-mst",
        "minimum-spanning-trees",
        "Prim minimum spanning tree",
        "Prim grows one component using the lightest boundary edge, often with a heap. Track visited vertices and skip stale edges; repeat from unvisited vertices for a forest.",
    ),
    KnowledgeChunk(
        "topological-sort",
        "topological-sort",
        "Topological ordering",
        "A DAG can be ordered by Kahn's indegree queue or DFS postorder. If fewer than V vertices are emitted, a directed cycle exists.",
    ),
    KnowledgeChunk(
        "scc",
        "strongly-connected-components",
        "Strongly connected components",
        "Kosaraju uses two DFS passes on a graph and its reverse; Tarjan uses low-link values in one pass. Condense components into a DAG before downstream reasoning.",
    ),
    KnowledgeChunk(
        "bridges-articulation",
        "graph-connectivity",
        "Bridges and articulation points",
        "DFS discovery times and low-link values identify whether a subtree has a back edge. An edge is a bridge when low[child] > tin[parent]; apply the root articulation rule separately.",
    ),
    KnowledgeChunk(
        "lca",
        "trees",
        "Lowest common ancestor",
        "LCA can be answered with binary lifting or an Euler tour plus RMQ. Record depths, lift the deeper node, then lift both from the highest power downward.",
    ),
    KnowledgeChunk(
        "binary-lifting",
        "binary-lifting",
        "Binary lifting",
        "Precompute the 2^k ancestor of every node. It supports ancestor jumps and LCA in O(log N) after O(N log N) preprocessing; guard jumps beyond the root.",
    ),
    KnowledgeChunk(
        "heavy-light-decomposition",
        "heavy-light-decomposition",
        "Heavy-light decomposition",
        "HLD splits a tree into heavy paths so a path becomes O(log N) segments. Combine it with a segment or Fenwick tree for path aggregates and point updates.",
    ),
    KnowledgeChunk(
        "network-flow",
        "network-flow",
        "Max flow and min cut",
        "Build a residual graph with reverse edges. BFS levels plus DFS blocking flow gives Dinic's algorithm; never mutate capacities without preserving residual reverses.",
    ),
    KnowledgeChunk(
        "bipartite-matching",
        "matching",
        "Bipartite matching",
        "For small graphs, augmenting paths increase a matching by one. Hopcroft-Karp groups BFS layers and finds many augmentations in O(E sqrt V).",
    ),
    KnowledgeChunk(
        "two-sat",
        "two-sat",
        "2-SAT implication graph",
        "Represent each literal and its negation as vertices. Add implications for each clause, compute SCCs, and reject when a variable and its negation share a component.",
    ),
    KnowledgeChunk(
        "kmp",
        "string-algorithms",
        "KMP prefix function",
        "The prefix function records the longest proper border ending at each position. On mismatch, jump to the border instead of rescanning; pattern matching is linear.",
    ),
    KnowledgeChunk(
        "z-function",
        "string-algorithms",
        "Z-function",
        "Z[i] is the length of the prefix matching the suffix at i. Maintain the rightmost matching interval and reuse its mirror value to obtain linear construction.",
    ),
    KnowledgeChunk(
        "rabin-karp",
        "string-algorithms",
        "Rabin-Karp rolling hash",
        "A rolling polynomial hash compares substrings quickly, but collisions are possible. Use two moduli or verify candidate matches when correctness is critical.",
    ),
    KnowledgeChunk(
        "suffix-array",
        "string-algorithms",
        "Suffix array",
        "A suffix array sorts all suffixes and an LCP array stores adjacent common-prefix lengths. It supports substring search and many lexicographic queries.",
    ),
    KnowledgeChunk(
        "aho-corasick",
        "string-algorithms",
        "Aho-Corasick automaton",
        "Build a trie of patterns and failure links to scan text once for all patterns. Output links report suffix patterns; complexity is linear in text plus total pattern length.",
    ),
    KnowledgeChunk(
        "manacher",
        "string-algorithms",
        "Manacher palindromes",
        "Manacher's algorithm computes odd and even palindrome radii in linear time by mirroring inside the rightmost known palindrome.",
    ),
    KnowledgeChunk(
        "sieve",
        "number-theory",
        "Prime sieve",
        "The sieve of Eratosthenes marks multiples from p^2 onward and runs in O(n log log n). Store the smallest prime factor when repeated factorization is needed.",
    ),
    KnowledgeChunk(
        "modular-arithmetic",
        "number-theory",
        "Modular arithmetic",
        "Normalize subtraction and multiplication under the modulus. Use fast exponentiation for powers, Fermat inverses only for prime moduli, and widen intermediates before multiplying.",
    ),
    KnowledgeChunk(
        "extended-gcd",
        "number-theory",
        "Extended Euclidean algorithm",
        "Extended gcd finds x and y with ax+by=gcd(a,b). It solves linear congruences and computes modular inverses when gcd(a,m)=1.",
    ),
    KnowledgeChunk(
        "combinatorics",
        "combinatorics",
        "Combinations under a modulus",
        "For a prime modulus, precompute factorials and inverse factorials to answer nCk in O(1) after O(n) setup. Validate bounds and normalize negative values.",
    ),
    KnowledgeChunk(
        "matrix-exponentiation",
        "matrix-exponentiation",
        "Matrix exponentiation",
        "Encode a linear recurrence as a transition matrix and exponentiate by squaring in O(k^3 log n), reducing modulo at every multiplication.",
    ),
    KnowledgeChunk(
        "chinese-remainder-theorem",
        "number-theory",
        "Chinese remainder theorem",
        "CRT combines compatible congruences with coprime or generalized moduli. Check consistency before multiplying moduli and use extended gcd for inverses.",
    ),
    KnowledgeChunk(
        "bitmask-dp",
        "dynamic-programming",
        "Bitmask dynamic programming",
        "Use a bitmask for a small subset dimension. Define what selected bits mean, enumerate transitions by setting or clearing one bit, and estimate O(2^n n) before committing.",
    ),
    KnowledgeChunk(
        "digit-dp",
        "dynamic-programming",
        "Digit DP",
        "Digit DP counts numbers under a bound using position, tightness, leading-zero, and problem-specific state. Solve for bound R minus bound L-1 and keep the state minimal.",
    ),
    KnowledgeChunk(
        "tree-dp",
        "dynamic-programming",
        "Tree dynamic programming",
        "Root the tree and combine child states in a postorder traversal. Separate values passed to the parent from values using multiple child branches.",
    ),
    KnowledgeChunk(
        "divide-conquer-dp",
        "dynamic-programming",
        "Divide-and-conquer DP optimization",
        "When argmin transitions are monotone, divide-and-conquer optimization reduces a layer from quadratic to O(n log n). Prove monotonicity before applying the optimization.",
    ),
    KnowledgeChunk(
        "meet-in-the-middle",
        "search-techniques",
        "Meet in the middle",
        "Split a 2^n search into two halves, enumerate each in O(2^(n/2)), and combine sorted or hashed results. It is useful when n is around 40.",
    ),
    KnowledgeChunk(
        "sqrt-decomposition",
        "range-queries",
        "Square-root decomposition",
        "Partition an array into blocks of about sqrt(n). Maintain block aggregates to answer range queries and updates in roughly O(sqrt n) without a tree.",
    ),
    KnowledgeChunk(
        "mos-algorithm",
        "range-queries",
        "Mo's offline queries",
        "Mo's ordering moves a sliding endpoint between offline ranges. Maintain an add/remove invariant and choose a block order to reduce pointer movement.",
    ),
    KnowledgeChunk(
        "coordinate-compression",
        "implementation",
        "Coordinate compression",
        "Sort unique values and replace each with its rank. Preserve ordering while shrinking a sparse numeric domain for Fenwick trees, grids, and sweep lines.",
    ),
    KnowledgeChunk(
        "sweep-line",
        "geometry",
        "Sweep-line event processing",
        "Turn geometric or interval interactions into ordered events. Define tie ordering explicitly, maintain active state, and remove intervals at the correct endpoint.",
    ),
    KnowledgeChunk(
        "game-theory",
        "game-theory",
        "Impartial game reasoning",
        "For impartial games, classify positions as winning or losing using Grundy values or the mex of reachable states. Nim xor is the canonical independent-pile result.",
    ),
    KnowledgeChunk(
        "convex-hull",
        "geometry",
        "Convex hull",
        "Sort points and use cross products to build lower and upper hulls. Decide whether collinear boundary points are kept and use wide integer arithmetic for cross products.",
    ),
    KnowledgeChunk(
        "fft-ntt",
        "polynomial-algorithms",
        "FFT and NTT convolution",
        "Convolution multiplies polynomials. FFT uses complex roots while NTT uses a suitable modular primitive root; manage rounding or modulus constraints and inverse transforms.",
    ),
    KnowledgeChunk(
        "constructive-algorithms",
        "problem-solving",
        "Constructive problem solving",
        "Work backward from invariants and conserved quantities. Build the smallest valid example, identify a repeating operation, and prove every generated object satisfies the constraints.",
    ),
    KnowledgeChunk(
        "technique-identification",
        "problem-solving",
        "Choosing a technique",
        "Translate the constraints and operation pattern before coding. Ask whether the task is range, graph, order, subset, string, or optimization structure, then test a simple invariant.",
    ),
    KnowledgeChunk(
        "stress-testing",
        "debugging",
        "Stress testing",
        "Write a slow trusted solver for tiny random inputs and compare it with the optimized solver. Seed randomness, shrink failing cases, and preserve the minimal counterexample.",
    ),
    KnowledgeChunk(
        "complexity-amortized",
        "complexity",
        "Amortized complexity",
        "A loop can be linear overall when a pointer or item only moves forward. Charge each push, pop, or deletion to the event that makes it happen and state the aggregate bound.",
    ),
    KnowledgeChunk(
        "rust-contest-practicalities",
        "languages",
        "Rust contest implementation checks",
        "Use usize for indices and i64 or i128 for arithmetic as constraints require. Prefer byte slices for ASCII strings, buffered I/O, and explicit ownership boundaries in graph structures.",
    ),
)

# The seed is deliberately versioned in the database, but keeping an expanded
# local corpus makes first boot useful when PostgreSQL or embeddings are not
# available. Each guide contributes concept, practice, and debugging retrieval
# anchors so short learner questions still land on a bounded, diverse set.
_ADDITIONAL_TOPIC_GUIDES: dict[str, tuple[str, str]] = {
    "arrays": ("Arrays", "index invariants, prefix transforms, and boundary cases"),
    "strings": ("Strings", "character positions, substrings, and linear scans"),
    "hashing": (
        "Hashing",
        "frequency maps, collision awareness, and lookup invariants",
    ),
    "sorting": ("Sorting", "ordering keys, stable behavior, and comparison bounds"),
    "binary-search": (
        "Binary search",
        "monotone predicates and first-feasible boundaries",
    ),
    "prefix-sums": ("Prefix sums", "range aggregation, difference arrays, and updates"),
    "two-pointers": (
        "Two pointers",
        "ordered scans, duplicate handling, and pointer proofs",
    ),
    "sliding-window": (
        "Sliding window",
        "validity invariants, frequency counts, and shrinking",
    ),
    "stacks-and-queues": ("Stacks and queues", "LIFO/FIFO state and event ordering"),
    "linked-lists": (
        "Linked lists",
        "pointer rewiring, sentinels, and ownership of next links",
    ),
    "heaps-and-priority-queues": (
        "Heaps",
        "best-next selection, lazy deletion, and priorities",
    ),
    "trees": ("Trees", "postorder state, path versus subtree values, and roots"),
    "binary-search-trees": (
        "Binary search trees",
        "ordered insertion, successor queries, and balance",
    ),
    "tries": ("Tries", "prefix paths, terminal counts, and alphabet representation"),
    "graphs": ("Graphs", "adjacency representation, components, and edge direction"),
    "bfs-and-dfs": (
        "BFS and DFS",
        "layers, reachability, visited timing, and recursion",
    ),
    "shortest-paths": (
        "Shortest paths",
        "relaxation, nonnegative weights, and negative cycles",
    ),
    "minimum-spanning-trees": (
        "Minimum spanning trees",
        "cut choices, DSU, and forest handling",
    ),
    "disjoint-set-union": (
        "Disjoint set union",
        "component representatives and union heuristics",
    ),
    "topological-sort": (
        "Topological sort",
        "indegree queues, DFS order, and cycle detection",
    ),
    "strongly-connected-components": (
        "Strongly connected components",
        "low links, reverse graphs, and condensation",
    ),
    "graph-connectivity": (
        "Graph connectivity",
        "bridges, articulation points, and low-link values",
    ),
    "dynamic-programming": (
        "Dynamic programming",
        "states, transitions, bases, and subproblem order",
    ),
    "advanced-dynamic-programming": (
        "Advanced dynamic programming",
        "state compression, optimization, and proof of transitions",
    ),
    "bitmask-dp": (
        "Bitmask DP",
        "subset state, bit transitions, and exponential bounds",
    ),
    "digit-dp": ("Digit DP", "tightness, leading zeros, and bound decomposition"),
    "tree-dp": ("Tree DP", "child aggregation and parent-facing states"),
    "greedy": ("Greedy algorithms", "exchange arguments, sorting keys, and invariants"),
    "recursion-and-backtracking": (
        "Recursion and backtracking",
        "choice trees, undo steps, and pruning",
    ),
    "segment-trees": (
        "Segment trees",
        "interval aggregates, lazy propagation, and overlap cases",
    ),
    "fenwick-trees": (
        "Fenwick trees",
        "lowbit blocks, prefix queries, and coordinate compression",
    ),
    "sparse-tables": (
        "Sparse tables",
        "static idempotent queries and logarithmic layers",
    ),
    "binary-lifting": (
        "Binary lifting",
        "doubling ancestors, depth alignment, and jumps",
    ),
    "lowest-common-ancestor": (
        "Lowest common ancestor",
        "lifting, Euler order, and tree paths",
    ),
    "heavy-light-decomposition": (
        "Heavy-light decomposition",
        "heavy paths, chain jumps, and path queries",
    ),
    "string-algorithms": (
        "String algorithms",
        "prefix borders, Z boxes, and substring matching",
    ),
    "suffix-arrays": (
        "Suffix arrays",
        "suffix ordering, LCP values, and binary search",
    ),
    "number-theory": ("Number theory", "gcd, modular arithmetic, sieves, and inverses"),
    "combinatorics": (
        "Combinatorics",
        "counting choices, factorials, and modular division",
    ),
    "geometry": (
        "Computational geometry",
        "orientation, cross products, and event order",
    ),
    "range-queries": (
        "Range queries",
        "offline ordering, block decomposition, and aggregates",
    ),
    "network-flow": ("Network flow", "residual edges, augmenting paths, and cuts"),
    "matching": ("Matching", "augmenting paths, bipartite layers, and certificates"),
    "game-theory": ("Game theory", "winning states, Grundy values, and xor"),
    "polynomial-algorithms": (
        "Polynomial algorithms",
        "convolution, transforms, and modular roots",
    ),
    "contest-strategy": (
        "Contest strategy",
        "triage, time allocation, and post-contest review",
    ),
    "problem-solving": (
        "Problem identification",
        "constraints, invariants, and technique selection",
    ),
    "debugging": (
        "Debugging",
        "minimal counterexamples, assertions, and differential tests",
    ),
    "complexity": ("Complexity", "operation budgets, amortization, and memory bounds"),
    "interviews": (
        "Algorithm interviews",
        "clarification, communication, correctness, and tradeoffs",
    ),
    "languages": (
        "Contest languages",
        "integer width, standard libraries, and input performance",
    ),
}


def _build_additional_chunks() -> tuple[KnowledgeChunk, ...]:
    chunks: list[KnowledgeChunk] = []
    for topic, (name, guide) in _ADDITIONAL_TOPIC_GUIDES.items():
        chunks.extend(
            (
                KnowledgeChunk(
                    f"curriculum-{topic}-concept",
                    topic,
                    f"{name}: concept and invariant",
                    f"Build a precise mental model for {name.lower()}: focus on {guide}. State the invariant before coding, identify what changes after each operation, and test the smallest valid input before optimizing.",
                ),
                KnowledgeChunk(
                    f"curriculum-{topic}-practice",
                    topic,
                    f"{name}: practice progression",
                    f"Practice {name.lower()} in three passes: trace a tiny example, implement the simplest correct version, then add one constraint-driven optimization. Record the expected time and space cost and explain why the chosen representation preserves {guide}.",
                ),
                KnowledgeChunk(
                    f"curriculum-{topic}-pitfalls",
                    topic,
                    f"{name}: common pitfalls and review",
                    f"When debugging {name.lower()}, check empty and boundary inputs, duplicated or disconnected values, and stale state between cases. Compare the failing trace with the invariant for {guide}; shrink the counterexample before changing the algorithm.",
                ),
            )
        )
    return tuple(chunks)


KNOWLEDGE_CHUNKS = KNOWLEDGE_CHUNKS + _build_additional_chunks()

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

_SYNONYMS: dict[str, set[str]] = {
    "dp": {"dynamic-programming", "dynamic", "programming"},
    "dynamic": {"dynamic-programming", "dp"},
    "seg": {"segment-tree", "segment-trees"},
    "segment": {"segment-tree", "segment-trees"},
    "bit": {"fenwick-tree", "fenwick-trees", "bitmask-dp", "bitmask"},
    "uf": {"dsu", "union-find"},
    "union-find": {"dsu", "union-find"},
    "shortest": {"shortest-paths", "dijkstra", "bellman-ford"},
    "mst": {"minimum-spanning-trees", "kruskal-mst", "prim-mst"},
    "lca": {"lowest-common-ancestor", "binary-lifting"},
    "dfs": {"bfs-and-dfs", "depth-first-search"},
    "bfs": {"bfs-and-dfs", "breadth-first-search"},
    "rmq": {"segment-trees", "sparse-tables", "range-queries"},
    "strings": {"string-algorithms", "strings"},
}


def _tokens(value: str) -> set[str]:
    tokens = {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9-]*", value.lower())
        if token not in _STOP_WORDS and (len(token) >= 2 or token == "c")
    }
    expanded = set(tokens)
    for token in tokens:
        expanded.update(
            part
            for part in token.split("-")
            if part not in _STOP_WORDS and (len(part) >= 2 or part == "c")
        )
    return expanded


def _expanded_tokens(value: str) -> set[str]:
    tokens = _tokens(value)
    expanded = set(tokens)
    for token in tokens:
        expanded.update(_SYNONYMS.get(token, ()))
    return expanded


def retrieve_knowledge(query: str, limit: int = 8) -> list[KnowledgeChunk]:
    query_tokens = _expanded_tokens(query)
    if not query_tokens:
        # A blank query should still return a broad, diverse foundation set,
        # rather than relying on whichever chunks happen to be first in a file.
        return list(KNOWLEDGE_CHUNKS[:limit])
    scored: list[tuple[float, int, KnowledgeChunk]] = []
    for index, chunk in enumerate(KNOWLEDGE_CHUNKS):
        title_tokens = _expanded_tokens(f"{chunk.topic} {chunk.title}")
        body_tokens = _expanded_tokens(chunk.content)
        title_overlap = len(query_tokens & title_tokens)
        body_overlap = len(query_tokens & body_tokens)
        topic_bonus = 2.5 if chunk.topic in query_tokens else 0
        # A small BM25-like saturation keeps repeated prose from dominating
        # while rewarding exact topic/title matches and synonym expansion.
        score = (
            topic_bonus
            + (2.0 * title_overlap) / (1.0 + title_overlap)
            + (1.0 * body_overlap) / (1.0 + body_overlap)
        )
        if score > 0:
            scored.append((score, -index, chunk))
    scored.sort(reverse=True, key=lambda item: (item[0], item[1]))
    selected: list[KnowledgeChunk] = []
    topic_counts: dict[str, int] = {}
    for _, _, chunk in scored:
        if topic_counts.get(chunk.topic, 0) >= 2:
            continue
        selected.append(chunk)
        topic_counts[chunk.topic] = topic_counts.get(chunk.topic, 0) + 1
        if len(selected) >= limit:
            break
    return selected
