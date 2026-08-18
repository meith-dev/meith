import type { NoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Alert, AlertDescription, AlertTitle } from '@meith/ui'

import { MICRO, MUTED_LINK } from '../shared'

export function Notice({ kind, message, dismissHref, copy }: NoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.notice.${key}`)

  const kindLabels: Record<NoticeModel['kind'], string> = {
    info: c('kindInfo'),
    success: c('kindSuccess'),
    warning: c('kindWarning'),
    error: c('kindError'),
  }

  return (
    <Alert tone={kind}>
      <AlertDescription>
        <AlertTitle className={MICRO}>{kindLabels[kind]}</AlertTitle> {message}
      </AlertDescription>

      {dismissHref !== null && (
        <a href={dismissHref} className={`shrink-0 text-xs ${MUTED_LINK}`}>
          {c('dismiss')}
        </a>
      )}
    </Alert>
  )
}
