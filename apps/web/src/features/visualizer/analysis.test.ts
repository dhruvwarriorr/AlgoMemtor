import { describe, expect, it } from 'vitest'

import {
  buildTimeline,
  collapsibleRanges,
  compareOutput,
  describeStep,
  importantSteps,
  pointersFor,
  stepContext,
  windowRange,
} from './analysis'
import { runCpp } from './engines/cpp'
import { readVisualizerHandoff, visualizerLanguageFor } from './handoff'
import { defaultTraceLimits } from './trace'

const run = (code: string, input = '') =>
  runCpp({ language: 'cpp', code, input, limits: defaultTraceLimits })

const printer = `#include <bits/stdc++.h>
using namespace std;
int main() {
  cout << 1 << "\\n";
  cout << 2 << " " << 3 << "\\n";
}`

describe('compareOutput', () => {
  it('ignores whitespace differences', () => {
    expect(compareOutput(run(printer), '1\n2   3')).toEqual({ status: 'match' })
  })

  it('finds the token and the step that printed it', () => {
    const trace = run(printer)
    const result = compareOutput(trace, '1\n2 4\n')
    expect(result).toMatchObject({
      status: 'mismatch',
      token: 3,
      expected: '4',
      actual: '3',
      outputLine: 2,
    })
    if (result.status === 'mismatch') {
      expect(trace.steps[result.step ?? -1]?.line).toBe(5)
    }
  })

  it('reports output that ends early', () => {
    const result = compareOutput(run(printer), '1 2 3 4')
    expect(result).toMatchObject({
      status: 'mismatch',
      actual: null,
      step: null,
    })
  })

  it('accepts small floating-point differences', () => {
    const trace = run(`#include <bits/stdc++.h>
int main() { printf("%.9f\\n", 1.0 / 3); }`)
    expect(compareOutput(trace, '0.333333333333')).toEqual({ status: 'match' })
  })
})

describe('timeline', () => {
  const loop = run(`int main() {
  int s = 0;
  for (int i = 0; i < 20; i++) {
    s += i;
  }
  return 0;
}`)

  it('collapses the middle of a long loop', () => {
    const ranges = collapsibleRanges(loop)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({ line: 3, from: 4, to: 18 })
    const rows = buildTimeline(loop, null, new Set(), 0)
    expect(rows.filter((row) => row.kind === 'collapsed')).toHaveLength(1)
    expect(rows.length).toBeLessThan(loop.steps.length)
  })

  it('expands a range on request and when the current step is inside it', () => {
    const [range] = collapsibleRanges(loop)
    if (range === undefined) throw new Error('missing range')
    expect(buildTimeline(loop, null, new Set([range.id]), 0)).toHaveLength(
      loop.steps.length,
    )
    const inside = buildTimeline(loop, null, new Set(), range.start + 1)
    expect(inside.some((row) => row.kind === 'collapsed')).toBe(false)
  })

  it('marks steps that change nothing as unimportant', () => {
    const trace = run(`int main() {
  int x = 1;
  ;
  if (x > 0) {
  }
  x = x;
  return 0;
}`)
    const important = importantSteps(trace)
    expect(important[0]).toBe(true)
    expect(important.at(-1)).toBe(true)
    const assignSame = trace.steps.findIndex((step) => step.line === 6)
    expect(important[assignSame]).toBe(false)
  })
})

describe('arrays and descriptions', () => {
  const twoPointers = run(
    `#include <bits/stdc++.h>
using namespace std;
int main() {
  vector<int> a = {1, 3, 4, 6, 9, 11};
  int l = 0, r = 5;
  while (l < r) {
    int sum = a[l] + a[r];
    if (sum == 13) break;
    if (sum < 13) l++;
    else r--;
  }
  cout << l << ' ' << r;
}`,
  )

  it('draws l and r as pointers with a window between them', () => {
    const step = twoPointers.steps.at(-1)
    const frame = step?.frames.at(-1)
    if (step === undefined || frame === undefined) throw new Error('no step')
    const pointers = pointersFor(twoPointers, step.frames, frame, 'a', 6)
    expect(pointers).toEqual(
      expect.arrayContaining([
        { name: 'l', index: 2 },
        { name: 'r', index: 4 },
      ]),
    )
    expect(windowRange(pointers)).toEqual([2, 4])
  })

  it('describes loop and branch steps from the recorded trace', () => {
    const loopStep = twoPointers.steps.findIndex(
      (step) => step.loop?.iteration === 2,
    )
    expect(describeStep(twoPointers, loopStep).title).toBe(
      'Loop at line 6 · iteration 2',
    )
    const branch = twoPointers.steps.findIndex(
      (step) => step.line === 9 && step.cond === true,
    )
    const description = describeStep(twoPointers, branch)
    expect(description.title).toBe('Line 9 · condition is true')
    expect(description.detail[0]).toContain('sum < 13')
  })

  it('builds a bounded Doubt Helper question from one step', () => {
    const lines = `#include <bits/stdc++.h>\n`.split('\n')
    const text = stepContext(twoPointers, 5, lines, '2 4')
    expect(text.length).toBeLessThanOrEqual(1_900)
    expect(text).toContain('Test Case Visualizer')
    expect(text).toContain('Expected output: "2 4"')
    expect(text).toContain('Variables in main')
  })
})

describe('handoff', () => {
  it('maps judge language names to engines', () => {
    expect(visualizerLanguageFor('GNU C++17')).toBe('cpp')
    expect(visualizerLanguageFor('C++')).toBe('cpp')
    expect(visualizerLanguageFor('C')).toBe('cpp')
    expect(visualizerLanguageFor('PyPy 3-64')).toBe('python')
    expect(visualizerLanguageFor('Java 21')).toBe('java')
    expect(visualizerLanguageFor('Rust')).toBeNull()
  })

  it('accepts only well-formed handoffs from history state', () => {
    expect(readVisualizerHandoff(null)).toBeNull()
    expect(readVisualizerHandoff({ visualizer: { source: 'x' } })).toBeNull()
    expect(
      readVisualizerHandoff({
        visualizer: {
          source: 'doubt_helper',
          language: 'cpp',
          code: 'x'.repeat(20_000),
        },
      }),
    ).toBeNull()
    expect(
      readVisualizerHandoff({
        visualizer: {
          source: 'solution_explorer',
          language: 'python',
          code: 'print(1)',
          problem: { title: 'Two Sum', url: 'javascript:alert(1)' },
          sessionId: 'not-a-uuid',
        },
      }),
    ).toEqual({
      source: 'solution_explorer',
      language: 'python',
      code: 'print(1)',
      problem: { title: 'Two Sum' },
    })
  })
})
