/**
 * A status token.
 *
 * The `tone` comes from `badgeVariants`, which names the *meanings* a board has
 * rather than the colours it uses — `tone="locked"`, not `tone="red"`. That is
 * the whole reason the mapping lives in one recipe: an operator who overrides
 * `--thread-locked` has moved every locked badge on the board, and a theme that
 * had written the colour at each call site would have moved none of them.
 *
 * **A badge is never the only carrier of its meaning.** Every use of this
 * component on the board puts the state in words inside it, because a hue is
 * absent for a substantial number of readers and gone entirely in a screen
 * reader. If you find yourself rendering an empty badge as a dot, that is a
 * `<span aria-hidden>` plus a `sr-only` sentence, not this.
 */

import { cn } from './utils'
import { badgeVariants, type BadgeVariants } from './variants'

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & BadgeVariants) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge }
