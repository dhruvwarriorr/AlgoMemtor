import { describe, expect, it } from 'vitest'

import {
  composePageContext,
  condense,
  pageContextLimit,
  wantsPageContext,
} from './page-context'
import { petStorageKey, readPetEnabled } from './pet-preference'

describe('composePageContext', () => {
  it('labels the page and lists its headings', () => {
    const context = composePageContext({
      title: 'Upsolve · AlgoMemtor',
      path: '/upsolve?contest=1900',
      headings: ['Upsolve', 'Queue'],
      text: 'Five problems to upsolve\n\n\n\nB. Two Arrays',
    })
    // The AI service recognises Mello's page by this exact opening.
    expect(
      context.startsWith('The learner has this AlgoMemtor page open'),
    ).toBe(true)
    expect(context).toContain('not saved')
    expect(context).toContain('Title: Upsolve · AlgoMemtor')
    expect(context).toContain('Address: /upsolve?contest=1900')
    expect(context).toContain('Headings: Upsolve · Queue')
    expect(context).toContain('Five problems to upsolve\nB. Two Arrays')
  })

  it('drops repeated lines that add length but no meaning', () => {
    expect(
      condense(
        '71\n71\nSolved\nNo problems\nNo problems\nx\nNo problems\ny\nNo problems',
      ),
    ).toBe('71\nSolved\nNo problems\nx\nNo problems\ny')
  })

  it('stays within the coach request limit', () => {
    const context = composePageContext({
      title: 'Long',
      path: '/problems',
      headings: [],
      text: 'x'.repeat(50_000),
    })
    expect(context.length).toBeLessThanOrEqual(pageContextLimit)
    expect(context.endsWith('…')).toBe(true)
  })

  it('says when a page has no readable text', () => {
    expect(
      composePageContext({ title: '', path: '/', headings: [], text: ' ' }),
    ).toContain('(no readable text)')
  })
})

describe('wantsPageContext', () => {
  it('skips the page for greetings and thanks', () => {
    expect(wantsPageContext('hi')).toBe(false)
    expect(wantsPageContext('Thanks!')).toBe(false)
  })

  it('reads the page for real questions', () => {
    expect(wantsPageContext('hi, explain this problem')).toBe(true)
    expect(wantsPageContext('What should I do next?')).toBe(true)
  })
})

describe('readPetEnabled', () => {
  const storage = (value: string | null) => ({
    getItem: (key: string) => (key === petStorageKey ? value : null),
  })

  it('is on unless turned off', () => {
    expect(readPetEnabled(storage(null))).toBe(true)
    expect(readPetEnabled(storage('on'))).toBe(true)
    expect(readPetEnabled(storage('off'))).toBe(false)
    expect(readPetEnabled(null)).toBe(true)
  })
})
