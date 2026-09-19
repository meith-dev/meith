import type { NoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, QUIET_LINK, TOUCH } from '../shared'

const TONE: Record<NoticeModel['kind'], string> = {
  info: 'border-l-foreground',
  success: 'border-l-moderation-approved',
  warning: 'border-l-moderation-pending bg-primary/9',
  error: 'border-l-destructive',
}

export function Notice({ kind, message, dismissHref, copy }: NoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.notice.${key}`)

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      data-tone={kind}
      className={`flex w-full items-start justify-between gap-4 border border-border border-l-2 px-4 py-3 ${TONE[kind]}`}
    >
      <p className="min-w-0 text-[0.9375rem] leading-relaxed text-foreground [&_a]:underline [&_a]:underline-offset-[0.3em]">
        <span className={`${LABEL} me-3`}>{c(kind)}</span>
        {message}
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className={`${LABEL} inline-flex shrink-0 items-center ${QUIET_LINK} ${TOUCH}`}
        >
          {c('dismiss')}
        </a>
      )}
    </div>
  )
}
