import { useState } from 'react'

import { Check } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

import { MelloSprite } from './MelloSprite'
import type { Pet } from './pets'

// One pet in a picker: its sprite (waving on hover or focus), name and
// tagline. The chosen pet is the learner's AI coach and gives it its name.
export function PetChoiceCard({
  pet,
  selected,
  onSelect,
}: {
  pet: Pet
  selected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer flex-col items-center rounded-xl border-2 bg-card p-2 pb-3 transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/20',
        selected
          ? 'border-primary'
          : 'border-border hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))]',
      )}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <input
        checked={selected}
        className="sr-only"
        name="coach-pet"
        onBlur={() => setHovered(false)}
        onChange={onSelect}
        onFocus={() => setHovered(true)}
        type="radio"
        value={pet.id}
      />
      <span className="grid h-[104px] w-full place-items-center rounded-lg bg-[#10162a]">
        <MelloSprite clips={pet.clips} state={hovered ? 'greet' : 'idle'} />
      </span>
      <span className="mt-2 text-sm font-semibold text-foreground">
        {pet.pickerLabel}
      </span>
      <span className="text-center text-xs text-muted-foreground">
        {pet.tagline}
      </span>
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute top-3.5 left-3.5 grid size-6 place-items-center rounded-md bg-primary text-primary-foreground shadow-md"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </label>
  )
}
