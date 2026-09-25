import type { IconProps } from '@/components/icons/algo-icons-line'
import { cn } from '@/lib/utils'

// Playback controls in the same 24-unit line style as the app's line icons.

function PlayerIcon({ className, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <path
        d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7Z"
        fill="currentColor"
      />
    </PlayerIcon>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <rect fill="currentColor" height="14" rx="1" width="3.6" x="6.4" y="5" />
      <rect fill="currentColor" height="14" rx="1" width="3.6" x="14" y="5" />
    </PlayerIcon>
  )
}

export function StepBackIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <path d="M17 6 9 12l8 6V6Z" fill="currentColor" />
      <path d="M6.5 6v12" />
    </PlayerIcon>
  )
}

export function StepForwardIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <path d="m7 6 8 6-8 6V6Z" fill="currentColor" />
      <path d="M17.5 6v12" />
    </PlayerIcon>
  )
}

export function RestartIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4.2h4.2" />
    </PlayerIcon>
  )
}

export function EndIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <path d="m5 6 7 6-7 6V6Z" fill="currentColor" />
      <path d="m12 6 7 6-7 6V6Z" fill="currentColor" />
    </PlayerIcon>
  )
}

export function BreakpointIcon(props: IconProps) {
  return (
    <PlayerIcon {...props}>
      <circle cx="12" cy="12" fill="currentColor" r="5" stroke="none" />
    </PlayerIcon>
  )
}
