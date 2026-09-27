import { describe, expect, it } from 'vitest'

import {
  readsInput,
  testCaseFromMarkdown,
  visualizerLanguageForFence,
} from './handoff'

describe('testCaseFromMarkdown', () => {
  it('reads the input and output blocks of a full walkthrough', () => {
    const content = [
      '## Complete Code',
      '```cpp',
      'int main() {}',
      '```',
      '## Test Case',
      '```input',
      '3',
      '1 2 3',
      '```',
      '```output',
      '6',
      '```',
    ].join('\n')
    expect(testCaseFromMarkdown(content)).toEqual({
      input: '3\n1 2 3',
      expected: '6',
    })
  })

  it('returns nothing when the answer has no test case', () => {
    expect(testCaseFromMarkdown('```cpp\nint main() {}\n```')).toEqual({})
  })
})

describe('visualizerLanguageForFence', () => {
  it('maps code fences to the languages the visualizer runs', () => {
    expect(visualizerLanguageForFence('cpp')).toBe('cpp')
    expect(visualizerLanguageForFence('Python3')).toBe('python')
    expect(visualizerLanguageForFence('java')).toBe('java')
    expect(visualizerLanguageForFence('input')).toBeNull()
    expect(visualizerLanguageForFence('rust')).toBeNull()
  })
})

describe('readsInput', () => {
  it('spots stdin reads in each language', () => {
    expect(readsInput('cpp', 'int t; cin >> t;')).toBe(true)
    expect(readsInput('cpp', 'scanf("%d", &n);')).toBe(true)
    expect(readsInput('python', 'n = int(input())')).toBe(true)
    expect(readsInput('python', 'data = sys.stdin.read()')).toBe(true)
    expect(readsInput('java', 'new Scanner(System.in)')).toBe(true)
  })

  it('ignores programs that only print, and reads in comments or strings', () => {
    expect(readsInput('cpp', 'cout << 1; // cin >> t')).toBe(false)
    expect(readsInput('cpp', 'puts("use cin");')).toBe(false)
    expect(readsInput('python', 'print("input()")  # input()')).toBe(false)
    expect(readsInput('java', 'System.out.println(1);')).toBe(false)
  })
})
