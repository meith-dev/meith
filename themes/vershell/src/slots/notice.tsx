import type { NoticeModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, TOUCH } from '../shared'

const DOT: Record<NoticeModel['kind'], string> = {
  info: 'bg-primary',
  success: 'bg-moderation-approved',
  warning: 'bg-thread-pinned',
  error: 'bg-destructive',
}

export function Notice({ kind, message, dismissHref, copy }: NoticeModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.notice.${key}`)

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      data-tone={kind}
      className="flex w-full items-start justify-between gap-4 rounded-[0.75rem] bg-card px-4 py-3 shadow-[0_0_0_1px_var(--color-border)]"
    >
      <p className="flex min-w-0 items-baseline gap-2.5 text-[0.9375rem] leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
        <span
          aria-hidden="true"
          className={`mt-[0.4em] size-2 shrink-0 rounded-full ${DOT[kind]}`}
        />
        <span className="min-w-0">
          <span className={`${LABEL} me-2`}>{c(kind)}</span>
          {message}
        </span>
      </p>

      {dismissHref !== null && (
        <a
          href={dismissHref}
          className={`${LABEL} inline-flex shrink-0 items-center transition-colors hover:text-foreground ${TOUCH}`}
        >
          {c('dismiss')}
        </a>
      )}
    </div>
  )
}
