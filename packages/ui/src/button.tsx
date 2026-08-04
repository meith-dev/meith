'use client'

/**
 * The interactive button — shadcn/ui's, on Base UI's primitive.
 *
 * **This is the client half of a pair, and it is the half you usually do not
 * want.** Base UI's `Button` is a `"use client"` module: it brings the press
 * behaviour, the focus handling, and a `disabled` that can keep a control in the
 * tab order when it still needs to be announced. All of that costs a client
 * boundary, and on a board almost nothing needs it — "New thread" is a link,
 * "Mark read" is a native form submit, and both of those want `buttonVariants`
 * on a plain element inside a server slot instead. See `variants.ts` for the
 * split and why it is drawn where it is.
 *
 * Reach for this component when the control genuinely lives in an island: a
 * submit that reports `useFormStatus().pending`, or anything that must be
 * `render`ed as a different element while keeping button semantics.
 *
 * `"use client"` is declared at the top of this file rather than being inherited
 * from the import, because a module's boundary should be readable where the
 * module starts rather than inferred from a dependency three files away — and
 * `scripts/slot-kinds.mjs` reads exactly that line when deciding whether a theme
 * has put an island where a server component belongs.
 */

import { Button as ButtonPrimitive } from '@base-ui/react/button'

import { cn } from './utils'
import { buttonVariants, type ButtonVariants } from './variants'

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
