import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendNotification,
  MAX_VISIBLE_NOTIFICATIONS,
  NOTIFICATION_DURATION_MS,
  removeNotification,
  scheduleNotificationExpiry,
} from './notification-utils'

type Notification = Parameters<typeof appendNotification>[1]

function notification(id: string): Notification {
  return { id, title: id, tone: 'info' }
}

describe('notification queue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps only the three newest notifications', () => {
    let current: Notification[] = []

    for (const id of ['one', 'two', 'three', 'four']) {
      current = appendNotification(current, notification(id))
    }

    expect(MAX_VISIBLE_NOTIFICATIONS).toBe(3)
    expect(current.map(({ id }) => id)).toEqual(['two', 'three', 'four'])
  })

  it('removes a notification by id', () => {
    const current = [notification('one'), notification('two')]

    expect(removeNotification(current, 'one')).toEqual([notification('two')])
  })

  it('expires a notification after four seconds', () => {
    vi.useFakeTimers()
    const remove = vi.fn()

    scheduleNotificationExpiry(remove)
    vi.advanceTimersByTime(NOTIFICATION_DURATION_MS - 1)
    expect(remove).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(remove).toHaveBeenCalledOnce()
  })
})
