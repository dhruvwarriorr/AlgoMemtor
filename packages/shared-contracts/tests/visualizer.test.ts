import { describe, expect, it } from 'vitest'

import {
  VISUALIZER_DEBUG_CODE_LIMIT,
  VisualizerDebugRequestSchema,
  VisualizerDebugResponseSchema,
} from '../src/visualizer.js'

const code =
  '\n#include <bits/stdc++.h>\nint main() {\n  int n; std::cin >> n;\n}\n'

const request = {
  mode: 'diagnose' as const,
  language: 'cpp' as const,
  code,
  input: '3\n',
  problem: {
    title: 'Sum to n',
    url: 'https://codeforces.com/problemset/problem/1/A',
  },
  digest: {
    status: 'finished' as const,
    recordedSteps: 12,
    totalSteps: 12,
    truncated: false,
    stdout: '3',
    expected: '6',
    mismatch: { token: 1, expected: '6', actual: '3', step: 11 },
    warnings: [{ step: 4, line: 4, message: 'sum may overflow' }],
    moments: [
      {
        step: 9,
        line: 5,
        event: 'line' as const,
        summary: 'Loop ends with i = 3',
        variables: 'i=3, sum=3',
      },
    ],
    focus: { step: 9, line: 5, description: 'The loop condition is false.' },
  },
}

const result = {
  verdict: 'bug_found' as const,
  headline: 'The loop stops one number early.',
  summary: 'At step 9 the loop ends before adding 3.',
  findings: [
    {
      title: 'Loop skips n',
      line: 5,
      step: 9,
      category: 'off_by_one' as const,
      severity: 'bug' as const,
      explanation: 'The condition i < n stops before adding n.',
      hint: 'Which values of i does the loop visit?',
      fix: {
        code: 'for (int i = 1; i <= n; i++) sum += i;',
        explanation: 'Include n.',
      },
    },
  ],
  suggestedTests: [{ input: '1\n', reason: 'Smallest n.' }],
  followUps: ['Why does i < n skip n?'],
}

describe('visualizer debug contract', () => {
  it('accepts a diagnose request and keeps the code as sent', () => {
    const parsed = VisualizerDebugRequestSchema.parse(request)
    // Leading blank lines stay so line numbers match the recorded trace.
    expect(parsed.code).toBe(code)
  })

  it('requires a question in ask mode', () => {
    expect(
      VisualizerDebugRequestSchema.safeParse({ ...request, mode: 'ask' })
        .success,
    ).toBe(false)
    expect(
      VisualizerDebugRequestSchema.safeParse({
        ...request,
        mode: 'ask',
        question: 'Why is sum 3?',
        history: [{ role: 'learner', content: 'Is my loop right?' }],
      }).success,
    ).toBe(true)
  })

  it('rejects blank and oversized code', () => {
    expect(
      VisualizerDebugRequestSchema.safeParse({
        ...request,
        code: 'x'.repeat(VISUALIZER_DEBUG_CODE_LIMIT + 1),
      }).success,
    ).toBe(false)
    expect(
      VisualizerDebugRequestSchema.safeParse({ ...request, code: ' \n ' })
        .success,
    ).toBe(false)
  })

  it('rejects unsafe problem links', () => {
    expect(
      VisualizerDebugRequestSchema.safeParse({
        ...request,
        problem: { url: 'http://localhost/problem' },
      }).success,
    ).toBe(false)
  })

  it('accepts a valid response', () => {
    expect(VisualizerDebugResponseSchema.parse({ data: result })).toEqual({
      data: result,
    })
  })

  it('rejects unknown fields', () => {
    expect(
      VisualizerDebugRequestSchema.safeParse({ ...request, extra: true })
        .success,
    ).toBe(false)
    expect(
      VisualizerDebugRequestSchema.safeParse({
        ...request,
        digest: { ...request.digest, source: 'x' },
      }).success,
    ).toBe(false)
    expect(
      VisualizerDebugResponseSchema.safeParse({
        data: { ...result, confidence: 0.9 },
      }).success,
    ).toBe(false)
    expect(
      VisualizerDebugResponseSchema.safeParse({
        data: {
          ...result,
          findings: [{ ...result.findings[0], url: 'https://x.dev' }],
        },
      }).success,
    ).toBe(false)
  })
})
