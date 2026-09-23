import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  AuthContext,
  type AuthContextValue,
} from '@/features/auth/auth-context'

import Topbar from './Topbar'

const authValue: AuthContextValue = {
  user: null,
  status: 'unauthenticated',
  sessionMessage: null,
  clearSessionMessage: () => undefined,
  signIn: () => Promise.resolve(),
  signUp: () => Promise.resolve(null),
  signOut: () => Promise.resolve(),
}

describe('landing topbar', () => {
  it('shows the logo mark and Get started on the initial page', () => {
    const markup = renderToStaticMarkup(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/']}>
          <Topbar />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(markup).toContain('aria-label="AlgoMemtor home"')
    expect(markup).toContain('Get started')
    expect(markup).not.toContain('Log in')
  })
})
