import type { NotificationInput } from './notification-context'

export type Notification = NotificationInput & {
  id: string
}

export const MAX_VISIBLE_NOTIFICATIONS = 3
export const NOTIFICATION_DURATION_MS = 4_000

export function appendNotification(
  current: Notification[],
  notification: Notification,
) {
  return [...current, notification].slice(-MAX_VISIBLE_NOTIFICATIONS)
}

export function removeNotification(current: Notification[], id: string) {
  return current.filter((notification) => notification.id !== id)
}

export function scheduleNotificationExpiry(remove: () => void) {
  return setTimeout(remove, NOTIFICATION_DURATION_MS)
}
