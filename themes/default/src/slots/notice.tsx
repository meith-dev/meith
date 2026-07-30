import type { NoticeModel } from '@forum/theme-kit'

/**
 * An inline notice (F25/F27) — a flash message or a board announcement.
 *
 * Colour comes from tokens per kind, and the kind is also announced: a notice
 * whose meaning is carried only by colour is invisible to a screen reader and to
 * anyone who cannot distinguish the hues, so each one is labelled in text too.
 *
 * Dismissal is a link, not a button with a handler. That makes it work with
 * JavaScript disabled (R5) and keeps this a server component — a dismissable
 * notice is the classic reason a layout region accidentally becomes an island.
 */
const KIND_CLASSES: Record<NoticeModel['kind'], string> = {
  info: 'border-border bg-card text-card-foreground',
  success: 'border-moderation-approved bg-card text-card-foreground',
  warning: 'border-moderation-pending bg-card text-card-foreground',
  error: 'border-destructive bg-card text-card-foreground',
}

const KIND_LABELS: Record<NoticeModel['kind'], string> = {
  info: 'Notice',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mx-auto flex w-full max-w-5xl items-start justify-between gap-4 rounded-md border-l-4 px-4 py-3 text-sm ${KIND_CLASSES[kind]}`}
    >
      <p>
        <span className="font-medium">{KIND_LABELS[kind]}: </span>
        {message}
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </a>
      )}
    </div>
  )
}
