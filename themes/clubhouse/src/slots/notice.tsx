import { Alert, AlertDescription, AlertTitle } from '@meith/ui'
import type { NoticeModel } from '@meith/theme-kit'

import { MICRO, MUTED_LINK } from '../shared'

const KIND_LABELS: Record<NoticeModel['kind'], string> = {
  info: 'Notice',
  success: 'Done',
  warning: 'Warning',
  error: 'Error',
}

export function Notice({ kind, message, dismissHref }: NoticeModel) {
  return (
    <Alert tone={kind}>
      <AlertDescription>
        <AlertTitle className={MICRO}>{KIND_LABELS[kind]}</AlertTitle> {message}
      </AlertDescription>

      {dismissHref !== null && (
        <a href={dismissHref} className={`shrink-0 text-xs ${MUTED_LINK}`}>
          Dismiss
        </a>
      )}
    </Alert>
  )
}
