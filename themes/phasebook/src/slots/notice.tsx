import type { NoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

const KIND = {
  info: {
    copyKey: 'info',
    className: 'border-primary/30 bg-primary/8 text-foreground',
    mark: 'bg-primary text-primary-foreground',
  },
  success: {
    copyKey: 'success',
    className: 'border-moderation-approved/30 bg-moderation-approved/8 text-foreground',
    mark: 'bg-moderation-approved text-card',
  },
  warning: {
    copyKey: 'warning',
    className: 'border-thread-pinned/30 bg-thread-pinned/8 text-foreground',
    mark: 'bg-thread-pinned text-card',
  },
  error: {
    copyKey: 'error',
    className: 'border-destructive/30 bg-destructive/8 text-foreground',
    mark: 'bg-destructive text-destructive-foreground',
  },
} as const

export function Notice({ kind, message, dismissHref, copy }: NoticeModel & { copy: SlotCopy }) {
  const tone = KIND[kind]
  const c = (key: string) => fromSlotCopy(copy, `phasebook.notice.${key}`)

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
        <span className="font-semibold">{c(tone.copyKey)}:</span> {message}
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {c('dismiss')}
        </a>
      )}
    </div>
  )
}
