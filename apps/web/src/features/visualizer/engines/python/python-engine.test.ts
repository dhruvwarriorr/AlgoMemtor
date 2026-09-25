import { loadPyodide, type PyodideAPI } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'

import { defaultTraceLimits, type ExecutionTrace } from '../../trace'
import { installTracer, runPython } from './index'

let pyodide: PyodideAPI

beforeAll(async () => {
  pyodide = await loadPyodide()
  installTracer(pyodide)
}, 60_000)

function run(code: string, input = '', limits = defaultTraceLimits) {
  return runPython(pyodide, { language: 'python', code, input, limits })
}

function finished(trace: ExecutionTrace) {
  if (trace.status !== 'finished') {
    throw new Error(
      `${trace.error?.title}: ${trace.error?.message} (line ${trace.error?.line})`,
    )
  }
  return trace
}

function text(trace: ExecutionTrace, id: number): string {
  const value = trace.values[id]
  if (value === undefined) return '?'
  switch (value.kind) {
    case 'number':
      return value.text
    case 'string':
      return JSON.stringify(value.text)
    case 'bool':
      return String(value.value)
    case 'sequence':
      return `[${value.items.map((item) => text(trace, item)).join(', ')}]`
    case 'mapping':
      return `{${value.entries.map(([k, v]) => `${text(trace, k)}: ${text(trace, v)}`).join(', ')}}`
    default:
      return value.kind
  }
}

describe('Python engine', () => {
  it('records lines, loop iterations, conditions and element reads', () => {
    const trace = finished(
      run(
        `n = int(input())
a = list(map(int, input().split()))
best = a[0]
for i in range(1, n):
    if a[i] > best:
        best = a[i]
print(best)
`,
        '5\n2 7 3 8 1\n',
      ),
    )
    expect(trace.stdout).toBe('8\n')
    const loop = trace.steps.filter((step) => step.loop?.line === 4)
    expect(loop.map((step) => step.loop?.iteration)).toEqual([1, 2, 3, 4, 4])
    expect(loop.at(-1)?.cond).toBe(false)
    const conditions = trace.steps
      .filter((step) => step.line === 5)
      .map((step) => step.cond)
    expect(conditions).toEqual([true, false, true, false])
    const read = trace.steps.find(
      (step) => step.line === 5 && step.reads !== undefined,
    )
    expect(read?.reads?.[0]).toEqual({ frame: 0, name: 'a', path: [1] })
    expect(trace.indexHints.a).toEqual(['i'])
    const last = trace.steps.at(-1)
    const best = last?.frames[0]?.vars.find(([name]) => name === 'best')
    expect(best === undefined ? undefined : text(trace, best[1])).toBe('8')
    expect(trace.steps.at(-1)?.in).toBe('5\n2 7 3 8 1\n'.length)
  })

  it('traces recursion with frames and return values', () => {
    const trace = finished(
      run(`def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))
`),
    )
    expect(trace.stdout).toBe('24\n')
    expect(trace.steps.filter((step) => step.event === 'call')).toHaveLength(4)
    const returns = trace.steps.filter((step) => step.event === 'return')
    expect(returns.map((step) => text(trace, step.value as number))).toEqual([
      '1',
      '2',
      '6',
      '24',
    ])
    expect(Math.max(...trace.steps.map((step) => step.frames.length))).toBe(5)
  })

  it('shows the failing step for an index error with details', () => {
    const trace = run(`a = [1, 2, 3]
total = 0
for i in range(4):
    total += a[i]
print(total)
`)
    expect(trace.status).toBe('error')
    expect(trace.error?.title).toBe('IndexError')
    expect(trace.error?.line).toBe(4)
    expect(trace.error?.details).toContain('Access attempted: a[3]')
    expect(trace.steps.at(-1)?.event).toBe('error')
    const total = trace.steps
      .at(-1)
      ?.frames[0]?.vars.find(([name]) => name === 'total')
    expect(total === undefined ? undefined : text(trace, total[1])).toBe('6')
  })

  it('reports syntax errors with a line', () => {
    const trace = run(`x = 1
if x > 0
    print(x)
`)
    expect(trace.error?.kind).toBe('compile')
    expect(trace.error?.line).toBe(2)
  })

  it('supports fast input idioms and dictionaries', () => {
    const trace = finished(
      run(
        `import sys
from collections import Counter, deque
data = sys.stdin.buffer.read().split()
n = int(data[0])
words = [w.decode() for w in data[1:1 + n]]
count = Counter(words)
q = deque([1, 2])
q.appendleft(0)
print(count.most_common(1)[0], list(q))
`,
        '3\na b a\n',
      ),
    )
    expect(trace.stdout).toBe("('a', 2) [0, 1, 2]\n")
  })

  it('stops infinite loops at the time limit', () => {
    const trace = run(
      `x = 0
while True:
    x += 1
`,
      '',
      { ...defaultTraceLimits, timeMs: 300, maxSteps: 200 },
    )
    expect(trace.status).toBe('error')
    expect(trace.error?.kind).toBe('timeout')
    expect(trace.truncated).toBe(true)
    expect(trace.steps.at(-1)?.event).toBe('error')
  })

  it('reports missing input clearly', () => {
    const trace = run(
      `a = int(input())
b = int(input())
print(a + b)
`,
      '5\n',
    )
    expect(trace.error?.title).toBe('EOFError')
    expect(trace.error?.line).toBe(2)
  })

  it('blocks access to the browser from learner code', () => {
    const trace = run('import js\n')
    expect(trace.error?.message).toContain('not available')
  })

  it('handles deep recursion up to the cap and reports beyond it', () => {
    const ok = finished(
      run(`import sys
sys.setrecursionlimit(10**6)
def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)
print(depth(1500))
`),
    )
    expect(ok.stdout).toBe('1500\n')
    const tooDeep = run(`import sys
sys.setrecursionlimit(10**6)
def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)
print(depth(100000))
`)
    expect(tooDeep.error?.kind).toBe('recursion')
  })

  it('does not record return steps for frames unwound by an exception', () => {
    const trace = run(`def f(x):
    return 10 // x

def g():
    return f(0)

g()
`)
    expect(trace.error?.title).toBe('ZeroDivisionError')
    const afterError = trace.steps.slice(
      trace.steps.findIndex((step) => step.event === 'error') + 1,
    )
    expect(afterError).toHaveLength(0)
    expect(trace.steps.at(-1)?.frames.map((frame) => frame.name)).toEqual([
      'global',
      'g',
      'f',
    ])
  })

  it('draws lists used with heapq as heaps and shows class instances as records', () => {
    const trace = finished(
      run(`import heapq
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
pq = []
for v in [5, 1, 3]:
    heapq.heappush(pq, v)
p = Point(1, 2)
print(heapq.heappop(pq), p.x)
`),
    )
    expect(trace.stdout).toBe('1 1\n')
    const last = trace.steps.at(-1)
    const pq = last?.frames[0]?.vars.find(([name]) => name === 'pq')
    const value = pq === undefined ? undefined : trace.values[pq[1]]
    expect(value?.kind === 'sequence' ? value.shape : undefined).toBe('heap')
    const point = last?.frames[0]?.vars.find(([name]) => name === 'p')
    const record = point === undefined ? undefined : trace.values[point[1]]
    expect(record?.kind).toBe('record')
    expect(
      trace.steps.some((step) =>
        step.frames.some((frame) => frame.name === 'Point'),
      ),
    ).toBe(false)
  })

  it('gives objects a stable identity and draws cycles as references', () => {
    const trace = finished(
      run(`class Node:
    def __init__(self, val):
        self.val = val
        self.next = None
        self.prev = None
a = Node(1)
b = Node(2)
a.next = b
b.prev = a
same = a
chain = Node(0)
p = chain
for i in range(1, 30):
    p.next = Node(i)
    p = p.next
print(same.next.val)
`),
    )
    expect(trace.stdout).toBe('2\n')
    const vars = trace.steps.at(-1)?.frames[0]?.vars ?? []
    const valueOf = (name: string) => {
      const found = vars.find(([key]) => key === name)
      return found === undefined ? undefined : trace.values[found[1]]
    }
    const a = valueOf('a')
    const same = valueOf('same')
    expect(a?.kind).toBe('record')
    expect(a?.kind === 'record' ? a.objectId : -1).toBe(
      same?.kind === 'record' ? same.objectId : -2,
    )
    expect(trace.values.some((value) => value.kind === 'ref')).toBe(true)
    // A 30-node chain is recorded to the end, not cut after a few levels.
    let node = valueOf('chain')
    let length = 0
    while (node?.kind === 'record') {
      length += 1
      const next = node.fields.find(([name]) => name === 'next')?.[1]
      node = next === undefined ? undefined : trace.values[next]
    }
    expect(length).toBe(30)
  })
})
