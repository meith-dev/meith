/**
 * The class recipes, kept apart from the components that use them.
 *
 * ## Why this file exists at all
 *
 * shadcn/ui puts `buttonVariants` next to `Button`, and on an ordinary React app
 * that is the right place for it. Here it would be a trap. `Button` is built on
 * Base UI, Base UI's primitives are `"use client"` modules, and **almost every
 * button on this board is not a button**: "New thread", "Reply", "Search" and
 * the rest are `<a href>` and native `<form>` submits inside server slots, which
 * is what makes a thread page ship no JavaScript. A server slot importing the
 * recipe from the same module as the component would pull a client boundary into
 * the post list to get at a string of class names.
 *
 * So the recipes live in a module that imports no React at all. A server slot
 * writes `className={buttonVariants({ variant: 'primary' })}` on a plain anchor
 * and gets the same button; a client island renders `<Button>` and gets the same
 * button with Base UI's focus, press and disabled handling underneath. One
 * appearance, two costs, and the choice is made per call site rather than once
 * for the whole design system.
 *
 * ## The rules these recipes follow
 *
 * - **No colour literal, ever.** Everything is a token utility, because a board
 *   restyles itself from the database (F26) and a hex here is a region an
 *   operator cannot reach. Guard `no-hardcoded-colour` enforces it in `.tsx`;
 *   this file is `.ts` and outside its glob, so the discipline is stated here
 *   instead.
 * - **No focus ring of their own.** `globals.css` gives `:focus-visible` a
 *   2px `--ring` outline globally, so a recipe that added one would either
 *   double it or, worse, replace it with something that disappears on the one
 *   theme that changed `--ring`.
 * - **Hit targets are at least 32px, and the interactive sizes reach 36–40.**
 *   A forum is used on a phone, one thumb, on a train.
 */

import { cva, type VariantProps } from 'class-variance-authority'

/**
 * A button, or something that should look like one.
 *
 * `primary` is deliberately the only variant with a filled background: a page
 * with two primary buttons on it has told the reader nothing about which one it
 * expects them to press. Everything else on a forum page — mark read, cancel,
 * jump, the moderation bar — is `secondary`, `outline` or `ghost`.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md border text-sm font-medium leading-none',
    'transition-[color,background-color,border-color,opacity] duration-100 ease-out',
    /*
     * `aria-disabled` as well as `:disabled`: a link cannot be disabled, and a
     * pending submit is often marked with the attribute rather than the
     * property so that the control keeps its accessible name.
     */
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-primary-foreground hover:opacity-90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border-border bg-card text-foreground hover:bg-muted',
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        /*
         * Tinted rather than filled. A solid red button is the loudest thing a
         * page can contain, and the destructive control on a board is almost
         * never the action the page is *for* — it is "delete this post", sitting
         * in a row beside "quote" and "edit".
         */
        destructive:
          'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'h-auto border-transparent p-0 text-foreground underline underline-offset-4 decoration-border hover:decoration-current',
      },
      size: {
        sm: 'h-8 gap-1.5 px-2.5 text-xs',
        default: 'h-9 px-3.5',
        lg: 'h-10 px-4',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>

/**
 * A small status token: a thread prefix, an unread count, a staff badge.
 *
 * The `tone` variants exist because a forum's badges mean things — pinned,
 * locked, awaiting approval — and the semantic tokens are where those meanings
 * are already written down. A badge that took a colour prop would put the
 * mapping in every call site instead, which is how "amber" ends up meaning
 * *pinned* on one page and *unapproved* on the next.
 *
 * Every tone is a tint plus a border rather than a fill, so a row of them does
 * not out-shout the thread title they are attached to.
 */
export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap',
    'rounded-sm border px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4 tracking-wide',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  ],
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        solid: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-border bg-transparent text-foreground',
        pinned: 'border-thread-pinned/30 bg-thread-pinned/10 text-thread-pinned',
        locked: 'border-thread-locked/30 bg-thread-locked/10 text-thread-locked',
        moved: 'border-thread-moved/30 bg-thread-moved/10 text-thread-moved',
        unapproved: 'border-thread-unapproved/30 bg-thread-unapproved/10 text-thread-unapproved',
        deleted: 'border-thread-deleted/30 bg-thread-deleted/10 text-thread-deleted',
        pending: 'border-moderation-pending/30 bg-moderation-pending/10 text-moderation-pending',
        approved:
          'border-moderation-approved/30 bg-moderation-approved/10 text-moderation-approved',
        rejected:
          'border-moderation-rejected/30 bg-moderation-rejected/10 text-moderation-rejected',
        admin: 'border-group-admin/30 bg-group-admin/10 text-group-admin',
        supermod: 'border-group-supermod/30 bg-group-supermod/10 text-group-supermod',
        mod: 'border-group-mod/30 bg-group-mod/10 text-group-mod',
        banned: 'border-group-banned/30 bg-group-banned/10 text-group-banned',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
