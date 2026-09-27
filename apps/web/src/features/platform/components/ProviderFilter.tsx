import type { LinkableProvider } from '@algomemtor/shared-contracts'

import { Select } from '@/components/ui/select'

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
      <Select
        className="font-normal"
        id={id}
        onValueChange={(next) =>
          onChange(options.find((provider) => provider === next))
        }
        options={[
          { value: '', label: 'All providers' },
          ...options.map((provider) => ({
            value: provider,
            label: providerLabels[provider],
          })),
        ]}
        value={value ?? ''}
      />
    </label>
  )
}
