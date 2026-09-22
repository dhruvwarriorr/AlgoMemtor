import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium tracking-[-0.005em] whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_16px_-8px_color-mix(in_oklab,var(--primary)_80%,transparent)] hover:bg-[color-mix(in_oklab,var(--primary),black_12%)] dark:hover:bg-[color-mix(in_oklab,var(--primary),white_10%)]',
        ink: 'bg-ink text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_8px_18px_-10px_rgb(11_18_32/0.7)] hover:bg-[color-mix(in_oklab,var(--ink),var(--primary)_22%)]',
        outline:
          'border-border bg-card text-foreground shadow-[0_1px_2px_rgb(22_52_102/0.06)] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] hover:bg-secondary aria-expanded:bg-secondary',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent',
        ghost:
          'text-foreground/80 hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground',
        destructive:
          'bg-danger-soft text-danger-foreground hover:bg-[color-mix(in_oklab,var(--danger-soft),var(--destructive)_16%)] focus-visible:ring-destructive/30',
        link: 'rounded-md text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-2 px-5 text-[0.9375rem]',
        icon: 'size-9',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
