import { cn } from './utils'
import { buttonVariants } from './variants'

export interface NavigationDrawerProps {
  readonly id: string
  readonly title: string
  readonly openLabel: string
  readonly closeLabel: string
  readonly showTrigger?: boolean
  readonly children: React.ReactNode
}

export function NavigationDrawerTrigger({
  target,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'children'> & {
  readonly target: string
  readonly label: string
}) {
  return (
    <button
      {...props}
      type="button"
      popoverTarget={target}
      aria-label={label}
      className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11', className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  )
}

export function NavigationDrawer({
  id,
  title,
  openLabel,
  closeLabel,
  showTrigger = true,
  children,
}: NavigationDrawerProps) {
  return (
    <>
      {showTrigger && <NavigationDrawerTrigger target={id} label={openLabel} />}
      <div
        id={id}
        popover="auto"
        role="dialog"
        data-slot="navigation-drawer"
        aria-labelledby={`${id}-title`}
        className="fixed inset-y-0 end-0 start-auto m-0 h-dvh max-h-dvh w-80 max-w-[calc(100vw-3rem)] flex-col border-0 border-s border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40 [&:popover-open]:flex"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={`${id}-title`} className="font-heading text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label={closeLabel}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11')}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
      </div>
    </>
  )
}
