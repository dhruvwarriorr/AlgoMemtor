import { describe, expect, it } from 'vitest'

import { withoutYourTurn } from './format'

describe('withoutYourTurn', () => {
  it('drops a trailing Your turn section from a saved answer', () => {
    expect(
      withoutYourTurn(
        '## Hint 1 · Nudge\n\nThink about sorting.\n\n## Your turn\n\nWhat is n?',
      ),
    ).toBe('## Hint 1 · Nudge\n\nThink about sorting.')
    expect(
      withoutYourTurn('Think about it.\n\n### **Your turn:**\nTry it'),
    ).toBe('Think about it.')
  })

  it('leaves answers without the section unchanged', () => {
    expect(withoutYourTurn('Your turning point is the prefix sum.')).toBe(
      'Your turning point is the prefix sum.',
    )
  })
})
