import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md border text-sm font-medium leading-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'transition-[color,background-color,border-color,opacity] duration-100 ease-out',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
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
        sm: 'h-8 gap-1.5 px-2.5 text-xs pointer-coarse:min-h-11',
        default: 'h-10 px-4 pointer-coarse:min-h-11',
        lg: 'h-11 px-5',
        icon: 'size-10 p-0 pointer-coarse:size-11',
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

export const controlVariants = cva(
  [
    'w-full min-w-0 rounded-md border border-input bg-card text-foreground',
    'transition-[border-color,box-shadow]',
    'duration-150',
    'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60',
    'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
    'pointer-coarse:min-h-11 pointer-coarse:text-base',
  ],
  {
    variants: {
      size: {
        sm: 'min-h-8 px-2.5 py-1 text-xs',
        default: 'min-h-10 px-3 py-2 text-sm',
      },
    },
    defaultVariants: { size: 'default' },
  },
)

export type ControlVariants = VariantProps<typeof controlVariants>

export const surfaceVariants = cva(
  'min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-elevation',
  {
    variants: {
      padded: { true: 'flex flex-col gap-4 p-5', false: '' },
    },
    defaultVariants: { padded: false },
  },
)

export const navTabListVariants = cva(
  'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1',
)

export const navTabVariants = cva(
  [
    'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors pointer-coarse:min-h-11',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  ],
  {
    variants: {
      active: {
        true: 'bg-card font-semibold text-primary shadow-sm',
        false: 'font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground',
      },
    },
    defaultVariants: { active: false },
  },
)
