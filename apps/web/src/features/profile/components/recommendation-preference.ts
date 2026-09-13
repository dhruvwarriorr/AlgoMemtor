export const recommendationPreferenceForRequest = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}
