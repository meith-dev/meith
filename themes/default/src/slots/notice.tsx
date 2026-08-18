import type { NoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Alert, AlertDescription, AlertTitle } from '@meith/ui'

import { MUTED_LINK } from '../shared'

const KIND_KEYS: Record<NoticeModel['kind'], string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
}

export function Notice({ kind, message, dismissHref, copy }: NoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.notice.${key}`)

  return (
    <Alert tone={kind}>
      <AlertDescription>
        <AlertTitle>{c(KIND_KEYS[kind])}</AlertTitle> {message}
      </AlertDescription>

      {dismissHref !== null && (
        <a href={dismissHref} className={`shrink-0 text-xs ${MUTED_LINK}`}>
          {c('dismiss')}
        </a>
      )}
    </Alert>
  )
}
