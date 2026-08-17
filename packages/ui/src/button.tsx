'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'

import { cn } from './utils'
import { type ButtonVariants, buttonVariants } from './variants'

export type ButtonProps = ButtonPrimitive.Props & ButtonVariants

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button }
