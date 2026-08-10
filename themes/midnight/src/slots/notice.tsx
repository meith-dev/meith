import type { NoticeModel } from '@meith/theme-kit'

const EDGE: Record<NoticeModel['kind'], string> = {
  info: 'border-l-primary',
  success: 'border-l-moderation-approved',
  warning: 'border-l-thread-pinned',
  error: 'border-l-destructive',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={`flex items-start justify-between gap-3 border border-l-4 border-border bg-muted px-3 py-2 text-sm ${EDGE[kind]}`}
    >
      <p>
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {kind}
          {': '}
        </span>
        {message}
      </p>
      {dismissHref !== null && (
        <a href={dismissHref} className="font-mono text-xs text-muted-foreground hover:text-foreground">
          dismiss
        </a>
      )}
    </div>
  )
}
