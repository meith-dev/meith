import { cn } from '@meith/ui'
import type { NoticeModel } from '@meith/theme-kit'

const KIND = {
  info: {
    label: 'Notice',
    className: 'border-primary/30 bg-primary/8 text-foreground',
    mark: 'bg-primary text-primary-foreground',
  },
  success: {
    label: 'Done',
    className: 'border-moderation-approved/30 bg-moderation-approved/8 text-foreground',
    mark: 'bg-moderation-approved text-card',
  },
  warning: {
    label: 'Warning',
    className: 'border-thread-pinned/30 bg-thread-pinned/8 text-foreground',
    mark: 'bg-thread-pinned text-card',
  },
  error: {
    label: 'Error',
    className: 'border-destructive/30 bg-destructive/8 text-foreground',
    mark: 'bg-destructive text-destructive-foreground',
  },
} as const

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  const tone = KIND[kind]

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-elevation',
        tone.className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          tone.mark,
        )}
      >
        {kind === 'error' || kind === 'warning' ? '!' : 'i'}
      </span>

      <p className="min-w-0 flex-1">
        <span className="font-semibold">{tone.label}:</span> {message}
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Dismiss
        </a>
      )}
    </div>
  )
}
