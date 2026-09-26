import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import { X } from '@/components/icons/algo-icons'
import { AnimatedList } from '@/components/ui/animated-list'
import { cueMelloSuccess } from '@/features/pet/mello-events'

import { NotificationGlyph } from './NotificationGlyph'
import {
  NotificationContext,
  type NotificationInput,
} from './notification-context'
import {
  appendNotification,
  NOTIFICATION_DURATION_MS,
  removeNotification,
  scheduleNotificationExpiry,
  type Notification,
} from './notification-utils'

// Dark glass cards in every theme: a coloured glow behind the badge, a tinted
// right edge, and a bar that counts down to auto-dismiss.
const toneStyles = {
  info: {
    glow: 'rgb(56 189 248 / 0.5)',
    edge: 'rgb(56 189 248 / 0.28)',
    badge: 'bg-[#38bdf8] text-[#03121c] shadow-[0_0_24px_rgb(56_189_248/0.55)]',
    bar: 'bg-[#38bdf8]',
  },
  success: {
    glow: 'rgb(74 222 128 / 0.45)',
    edge: 'rgb(34 197 94 / 0.3)',
    badge: 'bg-[#4ade80] text-[#052e14] shadow-[0_0_24px_rgb(74_222_128/0.5)]',
    bar: 'bg-[#4ade80]',
  },
  error: {
    glow: 'rgb(244 63 94 / 0.45)',
    edge: 'rgb(225 29 72 / 0.3)',
    badge:
      'bg-[#fb7185] text-[#3b0613] shadow-[0_0_24px_rgb(251_113_133/0.55)]',
    bar: 'bg-[#fb7185]',
  },
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
    // Mello, the coach pet, celebrates what the app reports as done.
    if (nextNotification.tone === 'success') cueMelloSuccess()

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
      <AnimatedList
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 w-auto max-w-sm sm:left-auto sm:w-full"
      >
        {notifications.map((notification) => {
          const tone = notification.tone ?? 'info'
          const style = toneStyles[tone]
          return (
            <div
              className="pointer-events-auto relative isolate overflow-hidden rounded-xl border border-white/10 bg-[#15171b]/95 py-4 pr-11 pl-4 text-[#f4f1ea] shadow-[0_24px_60px_-24px_rgb(0_0_0/0.85)] backdrop-blur-xl"
              key={notification.id}
              role={tone === 'error' ? 'alert' : 'status'}
            >
              <span
                aria-hidden="true"
                className="absolute top-1/2 -left-8 -z-10 size-32 -translate-y-1/2 rounded-full blur-2xl"
                style={{ background: style.glow }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 -z-10 w-1/2"
                style={{
                  background: `linear-gradient(90deg, transparent, ${style.edge})`,
                }}
              />
              <div className="flex min-w-0 items-start gap-3.5">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full ${style.badge}`}
                >
                  <NotificationGlyph tone={tone} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="break-words text-[0.95rem] font-semibold">
                    {notification.title}
                  </p>
                  {notification.description ? (
                    <p className="mt-1 break-words text-sm leading-relaxed text-[#f4f1ea]/65">
                      {notification.description}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                aria-label="Dismiss notification"
                className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-md text-[#f4f1ea]/55 transition-colors hover:bg-white/10 hover:text-[#f4f1ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
                onClick={() => remove(notification.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[3px] bg-white/8"
              >
                <span
                  className={`notification-timer block h-full origin-left ${style.bar}`}
                  style={{ animationDuration: `${NOTIFICATION_DURATION_MS}ms` }}
                />
              </span>
            </div>
          )
        })}
      </AnimatedList>
    </NotificationContext>
  )
}
