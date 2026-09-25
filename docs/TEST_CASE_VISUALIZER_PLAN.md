# Test Case Visualizer — Product Plan

## 1. Feature idea

The Test Case Visualizer is an interactive learning tool that lets a learner paste code, provide a test case, execute the code in a restricted environment, and inspect how the program state changes step by step.

The core visualizer is deterministic. It should not depend on AI to generate or guess execution steps.

AI may be used only as an optional explanation layer in places where AlgoMemtor already provides mentoring, such as Doubt Helper or Solution Explorer.

The feature should be available in three ways:

- as a standalone Test Case Visualizer;
- from Doubt Helper when a learner is debugging a failing case;
- from Solution Explorer when a learner wants to understand how a solution behaves on a sample or custom input.

---

## 2. Main goal

The tool should help learners answer questions such as:

- What happens to my variables at each step?
- Which branch was taken?
- How did this array, stack, queue, map, or pointer change?
- Why did this test case produce the wrong result?
- At what point did the actual execution diverge from what I expected?
- How does the optimal solution process this input?
- What changes between a passing and failing test case?

It should make program execution visually understandable without behaving like a full competitive-programming judge or submission platform.

---

## 3. Standalone user flow

A learner opens the Test Case Visualizer and provides:

1. programming language;
2. source code;
3. test input;
4. optional expected output.

The learner then selects **Run & Visualize**.

The tool executes the code and creates an execution timeline.

The learner can then move through the program using:

- Previous step
- Next step
- Play
- Pause
- Restart
- Jump to step
- Jump to next important event

The learner should always be able to see:

- the currently relevant code line;
- current variable values;
- input/output state;
- active data structures;
- what changed during the selected step.

---

## 4. Visualizer layout

The experience should be divided into four main areas.

### Code panel

Shows the learner's code with the currently executing line highlighted.

Useful indicators can include:

- current line;
- recently executed line;
- function currently running;
- breakpoint-like important events;
- read/write highlights.

### State panel

Shows current values of important variables.

Example:

```text
i = 3
left = 1
right = 6
sum = 14
answer = 4
```

Values that changed during the current step should be visually highlighted.

### Data structure visualization

The visual representation changes depending on the program state.

Examples:

- array cells;
- two pointers;
- sliding window;
- stack;
- queue/deque;
- set/map;
- matrix/grid;
- linked list;
- tree;
- graph;
- dynamic-programming table;
- recursion stack.

### Execution timeline

Shows important execution events.

Example:

```text
Start
↓
Read input
↓
Initialize variables
↓
Loop iteration 1
↓
Compare a[0] and a[1]
↓
Update max
↓
Loop iteration 2
↓
...
↓
Output
```

The learner can select any point on the timeline.

---

## 5. Step types

The visualizer should identify useful execution events instead of treating every low-level operation as equally important.

Useful step types include:

- variable assignment;
- variable update;
- comparison;
- condition result;
- branch taken;
- loop iteration;
- array read;
- array write;
- pointer movement;
- function call;
- function return;
- recursion call;
- push;
- pop;
- enqueue;
- dequeue;
- map/set lookup;
- insertion;
- deletion;
- graph-node visit;
- graph-edge traversal;
- DP-cell update;
- output produced.

The learner should be able to switch between:

- **Detailed mode** — more execution steps;
- **Important steps** — only meaningful state changes.

---

## 6. Array visualization

Arrays will likely be the most common visualization.

The tool should show:

- indexes;
- values;
- current index;
- recently accessed indexes;
- modified values;
- pointer positions;
- selected ranges.

Example:

```text
 index   0   1   2   3   4
       ┌───┬───┬───┬───┬───┐
 value │ 2 │ 7 │ 3 │ 8 │ 1 │
       └───┴───┴───┴───┴───┘
               ↑       ↑
             left    right
```

For algorithms such as sliding window, the active range should be clearly shown.

---

## 7. Stack, queue, and recursion visualization

### Stack

Show:

- current elements;
- top;
- push operation;
- pop operation.

### Queue / deque

Show:

- front;
- back;
- insertion/removal direction.

### Recursion

Show a call stack containing:

- function name;
- arguments;
- local variables;
- current recursion depth;
- return value when available.

This should make recursive algorithms much easier to follow.

---

## 8. Matrix and grid visualization

For grid problems, the learner should see:

- row and column indexes;
- current cell;
- visited cells;
- modified cells;
- current traversal frontier;
- relevant values.

This is especially useful for:

- BFS;
- DFS;
- flood fill;
- shortest paths on grids;
- DP on matrices.

---

## 9. Graph and tree visualization

When the program works with a graph or tree, the tool should show:

- nodes;
- edges;
- currently active node;
- visited nodes;
- traversal frontier;
- parent relationships where relevant.

For BFS/DFS, the queue or stack should be visible alongside the graph.

For trees, traversal order and recursion state should be easy to follow.

---

## 10. Dynamic-programming visualization

For DP problems, the tool should visualize the state table.

The learner should be able to see:

- which state is currently being calculated;
- previous states used;
- old value;
- new value;
- transition responsible for the update.

Example:

```text
dp[5] = max(dp[4], dp[2] + value[5])
```

Relevant source cells should be highlighted when a new DP state is calculated.

---

## 11. Input and output view

The visualizer should show:

- original input;
- which input values have already been consumed;
- current output;
- final output.

If the learner provides an expected output, show:

```text
Expected: 12
Actual:   10
```

When possible, highlight the step where the execution first leads toward the incorrect result.

---

## 12. Compare two test cases

The learner should be able to compare two executions.

Useful combinations include:

- passing case vs failing case;
- sample case vs custom case;
- normal case vs edge case.

The tool should identify the first meaningful point where the program states differ.

Example:

```text
Passing case
i = 3
sum = 10
condition = true

Failing case
i = 3
sum = 8
condition = false

First meaningful divergence: step 12
```

This can become one of the strongest debugging features in the visualizer.

---

## 13. Breakpoints and important events

The learner should be able to choose what they care about.

Useful options:

- stop when a variable changes;
- stop on a specific line;
- stop when an array index is accessed;
- stop when a condition becomes true;
- stop when output changes;
- stop when a function is called;
- stop on every loop iteration.

This should feel simpler than a professional debugger.

---

## 14. Handling long executions

Large loops can generate too many steps.

The visualizer should prevent the experience from becoming unusable.

Possible behavior:

```text
Iterations 20–847 repeat the same pattern.
```

The learner can then:

- skip repeated iterations;
- expand them if needed;
- jump to the final iteration;
- jump directly to the first state change.

The tool should prioritize understanding over displaying every machine-level action.

---

## 15. Error visualization

If execution fails, the tool should still visualize everything that happened before the failure.

Examples:

- runtime error;
- array index out of bounds;
- division by zero;
- stack overflow;
- timeout;
- excessive memory use;
- invalid input.

The final timeline event should clearly show where the failure occurred.

Example:

```text
Step 18

Access attempted:
a[5]

Array size:
5

Valid indexes:
0–4

Execution stopped here.
```

---

## 16. Standalone tool boundaries

The Test Case Visualizer should focus on understanding execution.

It should not try to become:

- a complete online judge;
- a submission system;
- a hidden-test provider;
- a full IDE;
- a replacement for Codeforces, CodeChef, LeetCode, or CSES.

The learner supplies the code and the input they want to inspect.

The tool visualizes that execution.

---

## 17. Doubt Helper integration

The Test Case Visualizer should be directly available from debugging-focused Doubt Helper sessions.

When the learner provides:

- code;
- a failing test case;
- wrong output;
- runtime error;
- or an edge case;

Doubt Helper can show:

**Visualize this test case**

Opening the visualizer should preserve the relevant problem, code, language, and test input for that interaction.

After the learner reaches an interesting step, the visualizer should offer:

**Ask Doubt Helper about this step**

Useful context can include:

- selected step;
- current line;
- variable values;
- active data structure state;
- condition result;
- actual output;
- expected output.

Doubt Helper can then explain the issue using the real execution state instead of reconstructing it only from the pasted code.

AI should explain the trace here, but the trace itself should come from actual execution.

---

## 18. Solution Explorer integration

Solution Explorer should allow learners to visualize the execution of an approach on:

- official sample inputs;
- learner-provided inputs;
- selected edge cases.

For each solution approach, provide an action such as:

**Visualize with a test case**

The learner should be able to understand concepts such as:

- how two pointers move;
- how a sliding window expands and contracts;
- how binary search changes its bounds;
- how BFS explores a graph;
- how a DP table is filled;
- how recursion unfolds.

This makes Solution Explorer more interactive without replacing its explanation and code walkthrough.

---

## 19. Optional explanation layer

The standalone visualizer should work fully without AI.

Optional explanation features can exist where they add value.

Examples:

- **Explain this step**
- **Why did this condition become false?**
- **Why is this variable wrong here?**
- **What should I inspect next?**
- **Explain the difference between these two executions**

These explanations should always use the actual recorded execution trace as their basis.

AI must never invent or replace execution results.

---

## 20. Useful test-case presets

When the visualizer is opened from a problem context, it can help the learner organize test cases into useful categories.

Examples:

- sample case;
- minimum input;
- maximum input;
- empty-like case where allowed;
- single-element case;
- duplicate values;
- already sorted;
- reverse sorted;
- all values equal;
- negative values;
- overflow-sensitive values;
- disconnected graph;
- single-node graph;
- cycle;
- deep recursion case.

These presets do not need to generate hidden tests. They simply help learners think about useful categories of inputs.

---

## 21. Session experience

A learner should be able to experiment quickly.

Typical flow:

```text
Paste code
→ enter test
→ run
→ inspect execution
→ modify code
→ rerun
→ compare previous and new execution
```

The visualizer should make iteration fast.

A later version may allow learners to keep named test cases such as:

```text
sample
edge-case-1
duplicates
overflow-case
my-failing-case
```

---

## 22. MVP

The first useful release should stay focused.

### MVP includes

- standalone Test Case Visualizer page;
- code input;
- language selection;
- custom test input;
- actual program execution;
- step-by-step timeline;
- highlighted current code line;
- scalar variable state;
- arrays;
- loop iterations;
- conditions and branches;
- input/output view;
- Previous / Next / Play / Pause / Restart;
- runtime-error visualization;
- execution-step limits;
- integration entry point from Doubt Helper;
- integration entry point from Solution Explorer.

### MVP does not need

- advanced graph animation;
- every STL/container type;
- full debugger functionality;
- hidden tests;
- competitive-programming submissions;
- AI-generated traces;
- complex code editing features.

---

## 23. Post-MVP improvements

After the basic trace experience is reliable, expand visualization support in roughly this order:

1. two pointers and sliding windows;
2. stack, queue, and deque;
3. recursion/call stack;
4. matrices and grids;
5. sets and maps;
6. linked lists;
7. trees;
8. graphs;
9. dynamic-programming tables;
10. compare-test-case mode;
11. compare-before-and-after-code mode;
12. custom breakpoints and watch variables.

---

## 24. Success criteria

The feature is successful when a learner can take a failing test case and answer:

- what the program actually did;
- where an important value changed;
- which branch or loop caused the unexpected behavior;
- how the data structure evolved;
- where actual behavior first diverged from expected behavior.

It should make debugging and algorithm understanding noticeably easier without requiring the learner to understand a professional debugger.

The most important principle is:

> **Execution should be real and deterministic. Explanation can be intelligent, but visualization must be grounded in what the program actually did.**
