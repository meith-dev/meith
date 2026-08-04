import { Alert, AlertDescription, AlertTitle } from '@meith/ui'
import type { NoticeModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

/**
 * An inline notice (F25/F27) — a flash message.
 *
 * Colour comes from tokens per kind, and the kind is also announced: a notice
 * whose meaning is carried only by colour is invisible to a screen reader and to
 * anyone who cannot distinguish the hues, so each one is labelled in text too.
 * `Alert` derives `role` from the same tone — `alert` for an error, which
 * interrupts, and `status` for everything else, which does not. That decision
 * lives in `@meith/ui` rather than here so that no call site can get it wrong by
 * forgetting a prop.
 *
 * Dismissal is a link, not a button with a handler. That makes it work with
 * JavaScript disabled (R5) and keeps this a server component — a dismissable
 * notice is the classic reason a layout region accidentally becomes an island.
 *
 * ## It carries no page measure, and used to
 *
 * "Inline" is the first word of this file for a reason: unlike `Header`,
 * `Footer` and `ForumJump` — page-level chrome that spans the viewport and
 * centres itself — a notice is rendered *into* a page's content, above the
 * thing it is talking about. Seventeen call sites render it, and fifteen of
 * them put it inside a container that was already centred and already padded,
 * so the slot's own `mx-auto max-w-6xl px-4` was a second inset: every flash
 * message on the board sat a gutter's width in from the content it belonged
 * to. `themes/midnight` reached the same shape independently and has always
 * been a bare banner.
 */
const KIND_LABELS: Record<NoticeModel['kind'], string> = {
  info: 'Notice:',
  success: 'Done:',
  warning: 'Warning:',
  error: 'Error:',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <Alert tone={kind}>
      <AlertDescription>
        <AlertTitle>{KIND_LABELS[kind]}</AlertTitle> {message}
      </AlertDescription>

      {dismissHref !== null && (
        <a href={dismissHref} className={`shrink-0 text-xs ${MUTED_LINK}`}>
          Dismiss
        </a>
      )}
    </Alert>
  )
}
