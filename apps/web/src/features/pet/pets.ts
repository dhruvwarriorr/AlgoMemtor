import type { MelloClip, MelloState, PetClips } from './mello-states'
import { petNames, type PetId } from './pet-ids'

export { isPetId, petIds, type PetId } from './pet-ids'

// Every pet is the same AI Coach in a different body. Their sprites live in
// assets/<pet>/<pose>.webp.
const sprites = import.meta.glob<string>('./assets/*/*.webp', {
  eager: true,
  import: 'default',
})

function sprite(pet: PetId, state: MelloState) {
  const src = sprites[`./assets/${pet}/${state}.webp`]
  if (src === undefined) throw new Error(`Missing sprite ${pet}/${state}`)
  return src
}

const labels: Record<MelloState, string> = {
  idle: 'Here with you',
  greet: 'Hi there',
  awe: 'Happy to see you',
  watching: 'Watching you type',
  scroll: 'Scrolling along',
  reading: 'Reading this page',
  thinking: 'Thinking',
  working: 'Working on it',
  idea: 'Got it',
  teaching: 'Explaining',
  success: 'Well done',
  sleepy: 'Getting sleepy',
  sleeping: 'Napping',
}

type ClipShape = Omit<MelloClip, 'src' | 'label'>

const pose = (fps: number, parent: MelloState): ClipShape => ({
  enter: 12,
  loop: 24,
  exit: 0,
  fps,
  parent,
})

// Typing: the pet watches the text box, its head tilting with the text.
const watching: ClipShape = {
  enter: 12,
  loop: 25,
  exit: 0,
  fps: 24,
  parent: 'idle',
  hold: { rest: 12 },
}

// Mello's hover clips come frame by frame from the reference video.
const melloShapes: Record<MelloState, ClipShape> = {
  idle: { enter: 0, loop: 24, exit: 0, fps: 14, parent: null },
  greet: {
    enter: 12,
    loop: 28,
    exit: 17,
    fps: 24,
    parent: 'idle',
    instant: true,
  },
  awe: { enter: 5, loop: 20, exit: 0, fps: 24, parent: 'greet', instant: true },
  watching,
  scroll: pose(14, 'idle'),
  reading: pose(14, 'idle'),
  thinking: pose(12, 'idle'),
  working: pose(16, 'thinking'),
  idea: pose(14, 'idle'),
  teaching: pose(14, 'idea'),
  success: pose(14, 'idle'),
  sleepy: pose(10, 'idle'),
  sleeping: pose(8, 'sleepy'),
}

// The other pets are built from one drawing per pose.
const sheetShapes: Record<MelloState, ClipShape> = {
  ...melloShapes,
  greet: { ...pose(16, 'idle'), instant: true },
  awe: { ...pose(16, 'greet'), instant: true },
}

function clipsFor(
  pet: PetId,
  shapes: Record<MelloState, ClipShape>,
  own: Partial<Record<MelloState, string>> = {},
): PetClips {
  const entries = (Object.keys(shapes) as MelloState[]).map((state) => [
    state,
    {
      ...shapes[state],
      src: sprite(pet, state),
      label: own[state] ?? labels[state],
    },
  ])
  return Object.fromEntries(entries) as PetClips
}

export type Pet = {
  id: PetId
  name: string
  // How the pet is listed in Settings, where both Kais appear.
  pickerLabel: string
  tagline: string
  // Glow and shadow tint.
  accent: string
  clips: PetClips
}

export const pets: Record<PetId, Pet> = {
  mello: {
    id: 'mello',
    pickerLabel: 'Mello',
    name: petNames.mello,
    tagline: 'The calm companion',
    accent: '#8b5cf6',
    clips: clipsFor('mello', melloShapes, { idle: 'Sipping tea' }),
  },
  kai: {
    id: 'kai',
    pickerLabel: 'Kai',
    name: petNames.kai,
    tagline: 'The organized coach',
    accent: '#3b82f6',
    clips: clipsFor('kai', sheetShapes, {
      reading: 'Looking closely',
      awe: 'So glad you are here',
    }),
  },
  luna: {
    id: 'luna',
    pickerLabel: 'Luna',
    name: petNames.luna,
    tagline: 'The kind explainer',
    accent: '#f472b6',
    clips: clipsFor('luna', sheetShapes, { idle: 'Reading along' }),
  },
  'kai-female': {
    id: 'kai-female',
    pickerLabel: 'Kai (female)',
    name: petNames['kai-female'],
    tagline: 'The organized coach, with her checklist',
    accent: '#60a5fa',
    clips: clipsFor('kai-female', sheetShapes, {
      reading: 'Looking closely',
      awe: 'So glad you are here',
    }),
  },
}
