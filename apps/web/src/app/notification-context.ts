import { createContext } from 'react'

export type NotificationTone = 'info' | 'success' | 'error'

export type NotificationInput = {
  title: string
  description?: string
  tone?: NotificationTone
}

export type NotificationContextValue = {
  notify: (notification: NotificationInput) => void
}

export const NotificationContext =
  createContext<NotificationContextValue | null>(null)
