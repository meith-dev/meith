import { cn } from './utils'

export interface DisclosureProps extends Omit<React.ComponentProps<'details'>, 'children'> {
  readonly summary: React.ReactNode
  readonly aside?: React.ReactNode
  readonly children: React.ReactNode
  readonly contentClassName?: string
}

function Disclosure({
  summary,
  aside,
  children,
  className,
  contentClassName,
  ...props
}: DisclosureProps) {
  return (
    <details
      data-slot="disclosure"
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    >
      <summary
        className={cn(
          'flex cursor-default list-none items-center gap-2 px-4 py-2.5 text-sm font-medium select-none',
          'transition-colors hover:bg-muted',
          '[&::-webkit-details-marker]:hidden [&::marker]:content-none',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 3 3 3-3 3" />
        </svg>

        <span className="min-w-0 flex-1 truncate">{summary}</span>

        {aside !== undefined && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">{aside}</span>
        )}
      </summary>

      <div className={cn('border-t border-border p-4', contentClassName)}>{children}</div>
    </details>
  )
}

export { Disclosure }
