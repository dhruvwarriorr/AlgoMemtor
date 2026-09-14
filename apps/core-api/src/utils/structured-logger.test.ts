import { afterEach, describe, expect, it, vi } from 'vitest'

import { structuredLogger } from './structured-logger.js'

describe('structuredLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops fields that are not explicitly safe to log', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})

    structuredLogger.info('provider_test', {
      provider: 'codeforces',
      resultCount: 2,
      discovered: 4,
      added: 2,
      complete: false,
      durationMs: 42,
      secret: 'do-not-log',
      authorization: 'do-not-log',
    })

    const output = String(consoleInfo.mock.calls[0]?.[0])
    expect(output).toContain('provider_test')
    expect(output).toContain('codeforces')
    expect(output).toContain('"discovered":4')
    expect(output).toContain('"added":2')
    expect(output).toContain('"complete":false')
    expect(output).toContain('"durationMs":42')
    expect(output).not.toContain('do-not-log')
    expect(output).not.toContain('authorization')
  })
})
