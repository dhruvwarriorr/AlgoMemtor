import { route } from '@/server/http/route'
import { timerAction } from '@/server/http/timer-action'

export const POST = route<{ sessionId: string }>(
  { auth: 'user' },
  ({ app, subject, params }) =>
    timerAction(app, subject, params.sessionId, 'pause'),
)
