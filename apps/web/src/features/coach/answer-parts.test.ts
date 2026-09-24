import { describe, expect, it } from 'vitest'

import { splitCoachAnswer } from './answer-parts'

describe('splitCoachAnswer', () => {
  it('separates prose from fenced code blocks in order', () => {
    const { segments, codeBlocks } = splitCoachAnswer(
      'Use a monotonic stack.\n\n```cpp\nint main() {}\n```\n\nThen test edge cases.\n\n~~~python\nprint(1)\n~~~',
    )
    expect(codeBlocks).toEqual([
      { index: 0, language: 'cpp', code: 'int main() {}' },
      { index: 1, language: 'python', code: 'print(1)' },
    ])
    expect(segments.map((segment) => segment.type)).toEqual([
      'text',
      'code',
      'text',
      'code',
    ])
  })

  it('keeps inline code in prose and treats an unclosed fence as code', () => {
    const { segments, codeBlocks } = splitCoachAnswer(
      'Call `solve()` once.\n```cpp\nvoid solve() {',
    )
    expect(segments[0]).toEqual({
      type: 'text',
      text: 'Call `solve()` once.\n',
    })
    expect(codeBlocks).toEqual([
      { index: 0, language: 'cpp', code: 'void solve() {' },
    ])
  })

  it('returns plain text unchanged when there is no code', () => {
    expect(splitCoachAnswer('Just text.')).toEqual({
      segments: [{ type: 'text', text: 'Just text.' }],
      codeBlocks: [],
    })
  })
})
