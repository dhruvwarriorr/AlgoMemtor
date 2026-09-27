// Pet identities without their sprites, so any page can name the coach
// without loading the pet's artwork.
export const petIds = ['mello', 'kai', 'luna', 'kai-female'] as const
export type PetId = (typeof petIds)[number]

export function isPetId(value: unknown): value is PetId {
  return petIds.some((id) => id === value)
}

// The coach's name is the chosen pet's name, everywhere in the app.
export const petNames: Record<PetId, string> = {
  mello: 'Mello',
  kai: 'Kai',
  luna: 'Luna',
  'kai-female': 'Kai',
}
