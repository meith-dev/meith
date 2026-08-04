/**
 * `@meith/ui` — the board's shadcn/ui component set, on Base UI.
 *
 * ## What is in this barrel, and what is deliberately not
 *
 * **Everything exported here renders on the server.** No module reachable from
 * this file declares `"use client"`, and that is a property worth stating rather
 * than a coincidence: a theme's slots are server components, a thread page is
 * fifty postbits, and a design system that dragged a client boundary in behind a
 * `<Card>` would cost the product the one number it is built around.
 *
 * The Base UI islands are **subpath-only** — `@meith/ui/button` — so importing
 * one is a visible line in a diff rather than something a bundler decides. The
 * package's `exports` map is what enforces this; `package.json` is the list.
 *
 * `packages/ui/package.json` has pointed `main` at this file since the package
 * was created, and until now the file did not exist: `@meith/ui` was a manifest,
 * a `cn` helper and one component that nothing imported. The barrel is therefore
 * the fix as much as the interface.
 *
 * ## Where the line between this package and a theme falls
 *
 * A component belongs here when it is *how a control looks and behaves* — a
 * card, a badge, a field. It belongs in a theme when it is *what a forum row
 * says*. `ForumRow` is not a `<ForumRow>` in this package and never will be: a
 * theme that could not decide the shape of its own listings would not be a
 * theme, and `themes/midnight` renders that same row as a `<tr>`.
 *
 * The practical test: if two themes would disagree about it, it is not here.
 */

export { cn } from './utils'

export { buttonVariants, badgeVariants } from './variants'
export type { ButtonVariants, BadgeVariants } from './variants'

export { Alert, AlertDescription, AlertTitle, alertVariants } from './alert'
export type { AlertTone } from './alert'

export { Avatar } from './avatar'
export type { AvatarProps } from './avatar'

export { Badge } from './badge'

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRows,
  CardTitle,
} from './card'
export type { CardProps } from './card'

export { Empty, EmptyAction, EmptyDescription, EmptyTitle } from './empty'

export { Field, Input, Label, NativeSelect, Textarea } from './field'
export type { FieldProps } from './field'

export { Separator } from './separator'
export type { SeparatorProps } from './separator'
