import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md border text-sm font-medium leading-none',
    'transition-[color,background-color,border-color,opacity] duration-100 ease-out',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border-border bg-card text-foreground hover:bg-muted',
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
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

export const textLinkVariants = cva(
  'underline decoration-border underline-offset-2 hover:decoration-foreground',
  {
    variants: {
      tone: {
        default: 'text-foreground',
        muted: 'text-muted-foreground hover:text-foreground',
        inherit: '',
      },
      weight: {
        medium: 'font-medium',
        normal: '',
      },
      size: {
        default: '',
        sm: 'text-sm',
        xs: 'text-xs',
      },
    },
    defaultVariants: { tone: 'default', weight: 'medium', size: 'default' },
  },
)

export type TextLinkVariants = VariantProps<typeof textLinkVariants>
