export const speeds = [1, 2, 4, 8, 16] as const
export type Speed = (typeof speeds)[number]

export type JumpTarget = {
  id: string
  label: string
  step: number | null
  tone?: 'danger' | 'warning'
}
