import { cn } from '@meith/ui'
import type { NoticeModel } from '@meith/theme-kit'

const KIND = {
  info: { label: 'Notice', accent: 'border-l-primary', text: 'text-primary' },
  success: { label: 'Done', accent: 'border-l-moderation-approved', text: 'text-moderation-approved' },
  warning: { label: 'Warning', accent: 'border-l-thread-pinned', text: 'text-thread-pinned' },
  error: { label: 'Error', accent: 'border-l-destructive', text: 'text-destructive' },
} as const

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  const tone = KIND[kind]

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-3 rounded-sm border border-border border-l-4 bg-card px-3 py-2.5 text-sm shadow-elevation',
        tone.accent,
      )}
    >
      <p className="min-w-0 flex-1">
        <span className={cn('font-bold', tone.text)}>{tone.label}</span>{' '}
        <span className="text-muted-foreground">— {message}</span>
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className="shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Dismiss
        </a>
      )}
    </div>
  )
}
