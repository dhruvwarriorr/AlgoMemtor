import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  NotificationContext,
  type NotificationInput,
} from './notification-context'
import {
  appendNotification,
  removeNotification,
  scheduleNotificationExpiry,
  type Notification,
} from './notification-utils'

const toneClasses = {
  info: 'border-border bg-background text-foreground',
  success: 'border-green-600 bg-green-50 text-green-950',
  error: 'border-destructive bg-red-50 text-red-950',
} as const

export function NotificationProvider({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timers = useRef(
    new Map<string, ReturnType<typeof scheduleNotificationExpiry>>(),
  )

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id)

    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }

    setNotifications((current) => removeNotification(current, id))
  }, [])

  const notify = useCallback((notification: NotificationInput) => {
    const nextNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      tone: notification.tone ?? 'info',
    }

    setNotifications((current) => appendNotification(current, nextNotification))
  }, [])

  useEffect(() => {
    const activeIds = new Set(
      notifications.map((notification) => notification.id),
    )

    for (const notification of notifications) {
      if (timers.current.has(notification.id)) {
        continue
      }

      const timer = scheduleNotificationExpiry(() => {
        timers.current.delete(notification.id)
        setNotifications((current) =>
          removeNotification(current, notification.id),
        )
      })

      timers.current.set(notification.id, timer)
    }

    for (const [id, timer] of timers.current) {
      if (!activeIds.has(id)) {
        clearTimeout(timer)
        timers.current.delete(id)
      }
    }
  }, [notifications])

  useEffect(() => {
    const activeTimers = timers.current

    return () => {
      for (const timer of activeTimers.values()) {
        clearTimeout(timer)
      }
      activeTimers.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <NotificationContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 left-4 z-50 flex w-auto max-w-sm flex-col gap-2 sm:left-auto sm:w-full"
      >
        {notifications.map((notification) => (
          <div
            className={`rounded-lg border p-4 shadow-lg ${
              toneClasses[notification.tone ?? 'info']
            }`}
            key={notification.id}
            role={notification.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words font-medium">{notification.title}</p>
                {notification.description ? (
                  <p className="mt-1 break-words text-sm opacity-80">
                    {notification.description}
                  </p>
                ) : null}
              </div>
              <button
                aria-label="Dismiss notification"
                className="rounded p-1"
                onClick={() => remove(notification.id)}
                type="button"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext>
  )
}
