/**
 * A rule.
 *
 * Base UI has a `Separator`, and it is a client module for the sake of an
 * orientation prop; this is the same element and the same ARIA with the prop
 * resolved at build time. A rule cannot change orientation at runtime on a
 * server-rendered board, so nothing is lost.
 *
 * `role="separator"` without `aria-orientation="vertical"` already means
 * horizontal, so only the vertical case declares it — and a decorative rule
 * (`decorative`, the common case between two counters) is hidden outright,
 * because a screen reader announcing "separator" between every number in a row
 * is noise with an accessible name.
 */

import { cn } from './utils'

export interface SeparatorProps extends React.ComponentProps<'div'> {
  readonly orientation?: 'horizontal' | 'vertical'
  /** True when the rule is only a visual join; hidden from assistive tech. */
  readonly decorative?: boolean
}

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'separator',
            ...(orientation === 'vertical' ? { 'aria-orientation': 'vertical' as const } : {}),
          })}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-4 w-px self-center',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
