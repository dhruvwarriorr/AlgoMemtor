import type { LearnerProfile } from '@algomemtor/shared-contracts'

// The settings editor presents the two existing profile notes as one field.
// Keep the API's bounded fields until the profile contract is changed.
export function combinedPracticeNote(
  profile: Pick<
    LearnerProfile,
    'recommendationPreference' | 'additionalConsiderations'
  >,
) {
  return [profile.recommendationPreference, profile.additionalConsiderations]
    .filter((note): note is string => Boolean(note?.trim()))
    .join('\n\n')
}

export function splitPracticeNote(value: string) {
  const note = value.trim()
  // Retain the boundary between existing notes when both were already saved.
  const paragraphBreak = note.lastIndexOf('\n\n', 500)
  if (
    paragraphBreak >= 0 &&
    note.slice(paragraphBreak + 2).trim().length <= 1_000
  ) {
    return {
      recommendationPreference: note.slice(0, paragraphBreak).trim(),
      additionalConsiderations: note.slice(paragraphBreak + 2).trim(),
    }
  }

  if (note.length <= 500) {
    return {
      recommendationPreference: note,
      additionalConsiderations: '',
    }
  }

  const minimumSplit = Math.max(0, note.length - 1_000)
  const lastSpace = note.lastIndexOf(' ', 500)
  const splitAt = lastSpace >= minimumSplit ? lastSpace : 500

  return {
    recommendationPreference: note.slice(0, splitAt).trim(),
    additionalConsiderations: note.slice(splitAt).trim(),
  }
}
