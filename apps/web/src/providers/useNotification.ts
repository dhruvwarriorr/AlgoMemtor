import { use } from 'react'

import { NotificationContext } from './notification-context'

export function useNotification() {
  const context = use(NotificationContext)

  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }

  return context
}
