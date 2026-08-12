import type { NoticeModel } from '@meith/theme-kit'

const TONE: Record<NoticeModel['kind'], string> = {
  info: 'border-l-forum-unread text-forum-unread',
  success: 'border-l-moderation-approved text-moderation-approved',
  warning: 'border-l-thread-pinned text-thread-pinned',
  error: 'border-l-destructive text-destructive',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={`flex items-start justify-between gap-3 border border-l-[3px] border-border bg-card px-3 py-2 text-sm shadow-elevation ${TONE[kind]}`}
    >
      <p className="text-foreground">
        <span className="mr-2 font-mono text-[0.625rem] font-bold tracking-[0.18em] uppercase">
          {kind}
        </span>
        {message}
      </p>
      {dismissHref !== null && (
        <a
          href={dismissHref}
          className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:text-primary"
        >
          dismiss
        </a>
      )}
    </div>
  )
}
