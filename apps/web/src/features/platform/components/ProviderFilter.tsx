import type { LinkableProvider } from '@algomemtor/shared-contracts'

import { providerLabels, providerOptions } from './provider-labels'

type ProviderFilterProps = {
  id: string
  value?: LinkableProvider
  onChange: (provider: LinkableProvider | undefined) => void
  options?: readonly LinkableProvider[]
}

export function ProviderFilter({
  id,
  value,
  onChange,
  options = providerOptions,
}: ProviderFilterProps) {
  return (
    <label className="min-w-40 space-y-1.5 text-sm font-medium text-foreground">
      Provider
      <select
        className="h-10 w-full rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
        id={id}
        onChange={(event) => {
          const next = event.currentTarget.value
          onChange(next ? (next as LinkableProvider) : undefined)
        }}
        value={value ?? ''}
      >
        <option value="">All providers</option>
        {options.map((provider) => (
          <option key={provider} value={provider}>
            {providerLabels[provider]}
          </option>
        ))}
      </select>
    </label>
  )
}
