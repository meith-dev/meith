import type { VariantProps } from 'class-variance-authority'

import { cn } from './utils'
import { textLinkVariants } from './variants'

export interface TextLinkProps
  extends React.ComponentProps<'a'>,
    VariantProps<typeof textLinkVariants> {}

export function TextLink({ className, tone, weight, size, ...props }: TextLinkProps) {
  return <a {...props} className={cn(textLinkVariants({ tone, weight, size }), className)} />
}
