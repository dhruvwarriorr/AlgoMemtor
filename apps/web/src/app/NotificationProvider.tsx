import { useCallback, useMemo, useState, type PropsWithChildren } from 'react'

import {
  NotificationContext,
  type NotificationInput,
} from './notification-context'

type Notification = NotificationInput & {
  id: string
}

const toneClasses = {
  info: 'border-border bg-background text-foreground',
  success: 'border-green-600 bg-green-50 text-green-950',
  error: 'border-destructive bg-red-50 text-red-950',
} as const

export function NotificationProvider({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const remove = useCallback((id: string) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id),
    )
  }, [])

  const notify = useCallback((notification: NotificationInput) => {
    setNotifications((current) => [
      ...current,
      {
        ...notification,
        id: crypto.randomUUID(),
        tone: notification.tone ?? 'info',
      },
    ])
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <NotificationContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {notifications.map((notification) => (
          <div
            className={`rounded-lg border p-4 shadow-lg ${
              toneClasses[notification.tone ?? 'info']
            }`}
            key={notification.id}
            role={notification.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{notification.title}</p>
                {notification.description ? (
                  <p className="mt-1 text-sm opacity-80">
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
