import { Alert, AlertDescription, AlertTitle } from '@meith/ui'
import type { NoticeModel } from '@meith/theme-kit'

import { MUTED_LINK, PAGE } from '../shared'

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
 */
const KIND_LABELS: Record<NoticeModel['kind'], string> = {
  info: 'Notice:',
  success: 'Done:',
  warning: 'Warning:',
  error: 'Error:',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <div className={`${PAGE} pt-4`}>
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
    </div>
  )
}
