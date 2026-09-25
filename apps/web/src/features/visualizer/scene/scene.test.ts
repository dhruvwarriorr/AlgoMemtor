import { describe, expect, it } from 'vitest'

import { runCpp } from '../engines/cpp'
import { runJava } from '../engines/java'
import { defaultTraceLimits, type ExecutionTrace } from '../trace'
import { buildScene } from './build'
import { callTreeAt } from './calls'
import { lookupIn, narrate, substitute } from './narrate'
import type { StructureView } from './types'

function cpp(code: string, input = '') {
  const trace = runCpp({
    language: 'cpp',
    code,
    input,
    limits: defaultTraceLimits,
  })
  if (trace.status !== 'finished') throw new Error(trace.error?.message)
  return trace
}

function java(body: string, extra = '', input = '') {
  const trace = runJava({
    language: 'java',
    code: `import java.util.*;
public class Main {
${extra}
    public static void main(String[] args) {
${body}
    }
}`,
    input,
    limits: defaultTraceLimits,
  })
  if (trace.status !== 'finished') throw new Error(trace.error?.message)
  return trace
}

function lines(trace: ExecutionTrace, code: string) {
  void trace
  return code.split('\n')
}

function structureAt(
  trace: ExecutionTrace,
  index: number,
  name: string,
): StructureView | undefined {
  return buildScene(trace, index, []).structures.find(
    (item) => item.name === name,
  )
}

function lastIndexWhere(
  trace: ExecutionTrace,
  test: (index: number) => boolean,
) {
  for (let index = trace.steps.length - 1; index >= 0; index -= 1) {
    if (test(index)) return index
  }
  return -1
}

describe('scene', () => {
  it('puts recorded values into a condition', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> a = {1, 4, 9, 23, 40};
    int target = 40, lo = 0, hi = 4;
    int mid = (lo + hi) / 2;
    if (a[mid] < target) lo = mid + 1;
    cout << lo << "\\n";
}`
    const trace = cpp(code)
    const index = trace.steps.findIndex(
      (step) => step.line === 7 && step.cond !== undefined,
    )
    const narration = narrate(trace, index, lines(trace, code))
    expect(narration.tone).toBe('true')
    expect(narration.code).toBe('a[mid] < target')
    expect(narration.evaluated).toBe('9 < 40')
    const step = trace.steps[index]
    if (step === undefined) throw new Error('no step')
    expect(
      substitute(trace, 'a[mid + 1] + a.size()', lookupIn(trace, step)).text,
    ).toBe('23 + 5')
  })

  it('keeps cell keys when values are swapped so the cells can slide', () => {
    const trace = cpp(`#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> a = {3, 1, 2};
    swap(a[0], a[1]);
    a[2] = 7;
}`)
    // A step shows the state after its line ran.
    const before = trace.steps.findIndex((step) => step.line === 4)
    const after = trace.steps.findIndex((step) => step.line === 5)
    const first = structureAt(trace, before, 'a')
    const second = structureAt(trace, after, 'a')
    if (first?.kind !== 'array' || second?.kind !== 'array') {
      throw new Error('expected arrays')
    }
    const [k0, k1, k2] = first.cells.map((cell) => cell.key)
    expect(second.cells.map((cell) => cell.text)).toEqual(['1', '3', '2'])
    expect(second.cells.map((cell) => cell.key)).toEqual([k1, k0, k2])
  })

  it('draws a stack, a queue and a priority queue', () => {
    const trace = cpp(`#include <bits/stdc++.h>
using namespace std;
int main() {
    stack<int> st;
    queue<int> q;
    priority_queue<int> pq;
    for (int i = 1; i <= 3; i++) { st.push(i); q.push(i * 10); pq.push(i); }
    st.pop();
    q.pop();
}`)
    const last = trace.steps.length - 1
    const scene = buildScene(trace, last, [])
    const kinds = Object.fromEntries(
      scene.structures.map((item) => [item.name, item.kind]),
    )
    expect(kinds).toMatchObject({ st: 'stack', q: 'queue', pq: 'heap' })
    const st = scene.structures.find((item) => item.name === 'st')
    expect(
      st?.kind === 'stack' ? st.items.map((cell) => cell.text) : [],
    ).toEqual(['1', '2'])
  })

  it('finds a graph in an adjacency list and marks visited and current nodes', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n = 4;
    vector<vector<int>> adj(n);
    int edges[3][2] = {{0, 1}, {1, 2}, {0, 3}};
    for (auto& e : edges) { adj[e[0]].push_back(e[1]); adj[e[1]].push_back(e[0]); }
    vector<bool> visited(n, false);
    queue<int> q;
    q.push(0);
    visited[0] = true;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (!visited[v]) { visited[v] = true; q.push(v); }
        }
    }
}`
    const trace = cpp(code)
    const index = lastIndexWhere(trace, (i) => {
      const view = structureAt(trace, i, 'adj')
      return (
        view?.kind === 'graph' &&
        view.nodes.some((node) => node.state === 'current')
      )
    })
    expect(index).toBeGreaterThan(0)
    const graph = structureAt(trace, index, 'adj')
    if (graph?.kind !== 'graph') throw new Error('expected a graph')
    expect(graph.nodes.map((node) => node.label).sort()).toEqual([
      '0',
      '1',
      '2',
      '3',
    ])
    expect(graph.directed).toBe(false)
    expect(graph.edges).toHaveLength(3)
    expect(graph.visitedSource).toBe('visited')
  })

  it('draws a linked list with the variables that point into it', () => {
    const trace = java(
      `        Node head = new Node(1);
        head.next = new Node(2);
        head.next.next = new Node(3);
        Node cur = head.next;
        System.out.println(cur.val);`,
      `    static class Node {
        int val;
        Node next;
        Node(int val) { this.val = val; }
    }`,
    )
    const last = trace.steps.length - 1
    const scene = buildScene(trace, last, [])
    const list = scene.structures.find((item) => item.kind === 'list')
    if (list?.kind !== 'list') throw new Error('expected a list')
    expect(list.name).toBe('head')
    expect(list.nodes.map((node) => node.label)).toEqual(['1', '2', '3'])
    expect(list.nodes[1]?.pointers).toContain('cur')
    expect(scene.structures.some((item) => item.name === 'cur')).toBe(false)
    expect(scene.scalars.find((chip) => chip.name === 'cur')?.pointer).toBe(
      true,
    )
  })

  it('draws a binary search tree by in-order position', () => {
    const trace = java(
      `        Node root = null;
        for (int v : new int[]{5, 3, 8, 1}) root = insert(root, v);
        System.out.println(root.key);`,
      `    static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }
    static Node insert(Node root, int key) {
        if (root == null) return new Node(key);
        if (key < root.key) root.left = insert(root.left, key);
        else root.right = insert(root.right, key);
        return root;
    }`,
    )
    const last = trace.steps.length - 1
    const tree = buildScene(trace, last, []).structures.find(
      (item) => item.kind === 'tree',
    )
    if (tree?.kind !== 'tree') throw new Error('expected a tree')
    const byLabel = Object.fromEntries(
      tree.nodes.map((node) => [node.label, node]),
    )
    expect(Object.keys(byLabel).sort()).toEqual(['1', '3', '5', '8'])
    // In-order columns: 1 < 3 < 5 < 8 from left to right; 5 is the root.
    expect((byLabel['1']?.x ?? 0) < (byLabel['3']?.x ?? 0)).toBe(true)
    expect((byLabel['3']?.x ?? 0) < (byLabel['5']?.x ?? 0)).toBe(true)
    expect((byLabel['5']?.x ?? 0) < (byLabel['8']?.x ?? 0)).toBe(true)
    expect(byLabel['5']?.y).toBeLessThan(byLabel['3']?.y ?? 0)
    expect(tree.edges).toHaveLength(3)
  })

  it('draws a 2D table as a grid and a 3D table as layers', () => {
    const trace = cpp(`#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<vector<int>> dp(2, vector<int>(3, 0));
    int cube[2][2][2] = {};
    dp[1][2] = 5;
    cube[1][0][1] = 4;
}`)
    const scene = buildScene(trace, trace.steps.length - 1, [])
    const dp = scene.structures.find((item) => item.name === 'dp')
    const cube = scene.structures.find((item) => item.name === 'cube')
    expect(dp?.kind).toBe('grid')
    expect(dp?.kind === 'grid' ? dp.rows[1]?.[2]?.text : '').toBe('5')
    expect(cube?.kind).toBe('cube')
  })

  it('builds the recursion tree with return values', () => {
    const trace = cpp(`#include <bits/stdc++.h>
using namespace std;
int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
int main() { cout << fib(3) << "\\n"; }`)
    const view = callTreeAt(trace, trace.steps.length - 1)
    expect(view?.nodes.map((node) => node.label)).toContain('fib(3)')
    expect(view?.nodes).toHaveLength(5)
    const root = view?.nodes.find((node) => node.label === 'fib(3)')
    expect(root?.value).toBe('2')
  })

  it('narrates reads from the input and printed output', () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    cout << n * 2 << "\\n";
}`
    const trace = cpp(code, '21\n')
    const read = trace.steps.findIndex((step) => step.line === 5)
    expect(narrate(trace, read, code.split('\n')).tone).toBe('input')
    const print = trace.steps.findIndex((step) => step.line === 6)
    expect(narrate(trace, print, code.split('\n')).headline).toBe(
      'Printed "42"',
    )
  })

  it('draws a priority queue in its real heap layout, like g++', () => {
    const trace = cpp(`#include <bits/stdc++.h>
using namespace std;
int main() {
    priority_queue<int> pq;
    int xs[] = {5, 1, 8, 3, 9, 2, 7, 6, 4};
    for (int x : xs) pq.push(x);
    int keep = 0;
    pq.pop();
    pq.pop();
    keep++;
}`)
    const pushedAll = trace.steps.findIndex((step) => step.line === 7)
    const full = structureAt(trace, pushedAll, 'pq')
    if (full?.kind !== 'heap') throw new Error('expected a heap')
    // Layout printed by libstdc++ for the same pushes and pops.
    expect(full.items.map((cell) => cell.text)).toEqual(
      '9 8 7 6 3 2 5 1 4'.split(' '),
    )
    expect(full.order).toBe('max')
    expect(full.popOrder?.slice(0, 3)).toEqual(['9', '8', '7'])
    const popped = trace.steps.findIndex((step) => step.line === 8)
    expect(
      structureAt(trace, popped, 'pq')?.kind === 'heap'
        ? (structureAt(trace, popped, 'pq') as { popped: string[] }).popped
        : [],
    ).toEqual(['9'])
    const after = structureAt(trace, trace.steps.length - 1, 'pq')
    expect(
      after?.kind === 'heap' ? after.items.map((cell) => cell.text) : [],
    ).toEqual('7 6 5 4 3 2 1'.split(' '))
  })

  it('treats a Java PriorityQueue with its natural order as a min-heap', () => {
    const trace =
      java(`        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int x : new int[]{5, 1, 4}) pq.add(x);
        pq.poll();`)
    const heap = buildScene(trace, trace.steps.length - 1, []).structures.find(
      (item) => item.kind === 'heap',
    )
    expect(heap?.kind === 'heap' ? heap.order : null).toBe('min')
    expect(heap?.kind === 'heap' ? heap.items[0]?.text : null).toBe('4')
  })
})
