import { describe, expect, it, vi } from 'vitest'

import {
  parseCodeChefHandle,
  parseCodeforcesHandle,
  syncClaim,
} from './claims.js'
import { failure } from './sync.js'

const codeforcesSignedIn = `<div class="lang-chooser"><div style="text-align: right;">flags</div>
  <div><a href="/profile/dhruv_w">dhruv_w</a> | <a href="/4c1f2e/logout">Logout</a></div></div>`
const codeforcesSignedOut = `<div class="lang-chooser"><div>flags</div>
  <div><a href="/enter?back=%2F">Enter</a> | <a href="/register">Register</a></div></div>
  <a href="/profile/tourist">tourist</a>`

describe('signed-in handle detection', () => {
  it('reads the Codeforces header, not other profile links', () => {
    expect(parseCodeforcesHandle(codeforcesSignedIn)).toBe('dhruv_w')
    expect(parseCodeforcesHandle(codeforcesSignedOut)).toBeNull()
  })

  it('reads the CodeChef Drupal settings username', () => {
    const page = (username: string) =>
      `<script>jQuery.extend(Drupal.settings, {"visitedContests":[],"username":${username},"x":1});</script>`
    expect(parseCodeChefHandle(page('"chef_learner"'))).toBe('chef_learner')
    expect(parseCodeChefHandle(page('null'))).toBeNull()
  })

  it('finds the CodeChef username when the settings hold markup', () => {
    const html = `<script>jQuery.extend(Drupal.settings, {"banner":"<b>New</b>","username":"chef_learner"});</script>`
    expect(parseCodeChefHandle(html)).toBe('chef_learner')
  })
})

describe('claim sync', () => {
  const now = () => new Date('2026-09-23T12:00:00.000Z')

  it('claims the signed-in handle and reports a queued sync', async () => {
    const claim = vi.fn(async () => ({
      handle: 'dhruv_w',
      verified: true,
      syncQueued: true,
    }))
    const outcome = await syncClaim(
      'codeforces',
      async () => new Response(codeforcesSignedIn),
      claim,
      now,
    )
    expect(claim).toHaveBeenCalledWith('codeforces', 'dhruv_w')
    expect(outcome).toMatchObject({
      status: 'synced',
      handle: 'dhruv_w',
      message: 'Verified; AlgoMemtor is syncing it now.',
    })
  })

  it('asks to sign in instead of claiming when signed out', async () => {
    const claim = vi.fn()
    const outcome = await syncClaim(
      'codeforces',
      async () => new Response(codeforcesSignedOut),
      claim,
      now,
    )
    expect(claim).not.toHaveBeenCalled()
    expect(outcome.status).toBe('signed_out')
  })

  it('asks the loaded page for the handle when the HTML names none', async () => {
    const claim = vi.fn(async () => ({
      handle: 'chef_learner',
      verified: true,
      syncQueued: true,
    }))
    const outcome = await syncClaim(
      'codechef',
      async () => new Response('<html><body>app</body></html>'),
      claim,
      now,
      async () => 'chef_learner',
    )
    expect(claim).toHaveBeenCalledWith('codechef', 'chef_learner')
    expect(outcome.status).toBe('synced')
  })

  it('keeps the real reason when a sync fails unexpectedly', () => {
    const outcome = failure(
      { read: vi.fn(), upload: vi.fn(), sleep: vi.fn(), now },
      new Error('Missing host permission for the tab'),
    )
    expect(outcome.message).toBe(
      'The sync failed: Missing host permission for the tab',
    )
  })
})
