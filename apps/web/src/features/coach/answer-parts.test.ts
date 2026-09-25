import { describe, expect, it } from 'vitest'

import { plainMath, splitCoachAnswer } from './answer-parts'

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

describe('plainMath', () => {
  it('turns TeX math into readable text and leaves money and code alone', () => {
    expect(
      plainMath(
        'Map input bounds (e.g., $O(N \\log N)$ vs $O(N^2)$) and $a_{i} \\le 10^{9}$.',
      ),
    ).toBe('Map input bounds (e.g., O(N log N) vs O(N²)) and a_i ≤ 10⁹.')
    expect(plainMath('It costs $5 and $10.')).toBe('It costs $5 and $10.')
    expect(plainMath('Time: $ O((V + E) \\log V) $.')).toBe(
      'Time: O((V + E) log V).',
    )
    expect(plainMath('Keep `$x$` and\n```\n$y$\n```')).toBe(
      'Keep `$x$` and\n```\n$y$\n```',
    )
  })
})
