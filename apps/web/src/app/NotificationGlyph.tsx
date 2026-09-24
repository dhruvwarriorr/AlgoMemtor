import { Check, Sparkles, X } from '@/components/icons/algo-icons'

import type { NotificationTone } from './notification-context'

type NotificationGlyphProps = {
  tone: NotificationTone
  className?: string
}

// Solid AlgoMemtor marks: the coach's A for information, a check for
// progress, and a cross for errors.
export function NotificationGlyph({
  tone,
  className = 'size-5',
}: NotificationGlyphProps) {
  const Glyph = tone === 'success' ? Check : tone === 'error' ? X : Sparkles
  return <Glyph aria-hidden="true" className={className} data-tone={tone} />
}
