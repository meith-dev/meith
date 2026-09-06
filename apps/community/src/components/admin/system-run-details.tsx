import type { Translator } from '@meith/i18n'

import { systemRunDetail } from '@/view/system-run-detail'

const FIELD_KEYS: Readonly<Record<string, string>> = {
  attempted: 'adminSystem.result.attempted',
  delivered: 'adminSystem.result.delivered',
  retried: 'adminSystem.result.retried',
  dead: 'adminSystem.result.dead',
  relayed: 'adminSystem.result.relayed',
  processed: 'adminSystem.result.processed',
  removed: 'adminSystem.result.removed',
  corrected: 'adminSystem.result.corrected',
  flushed: 'adminSystem.result.flushed',
  rendered: 'adminSystem.result.rendered',
  indexed: 'adminSystem.result.indexed',
  ok: 'adminSystem.result.ok',
  listingCount: 'adminSystem.result.listingCount',
  notified: 'adminSystem.result.notified',
  promoted: 'adminSystem.result.promoted',
  lifted: 'adminSystem.result.lifted',
  expired: 'adminSystem.result.expired',
  deleted: 'adminSystem.result.deleted',
  failed: 'adminSystem.result.failed',
  memberCount: 'adminSystem.result.memberCount',
  online: 'adminSystem.result.online',
  record: 'adminSystem.result.record',
  ran: 'adminSystem.result.ran',
  trigger: 'adminSystem.result.trigger',
  bundle: 'adminSystem.result.bundle',
  status: 'adminSystem.result.status',
  skipped: 'adminSystem.result.skipped',
}

export function SystemRunDetails({
  detail,
  translator,
}: {
  detail: string | null
  translator: Translator
}) {
  const fields = systemRunDetail(detail)
  if (fields.length === 0) return null

  const label = (key: string) => {
    const message = Object.hasOwn(FIELD_KEYS, key) ? FIELD_KEYS[key] : undefined
    if (message !== undefined) return translator.t(message)
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  return (
    <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
      {fields.map((field) => (
        <div key={JSON.stringify(field.path)} className="flex min-w-0 flex-wrap gap-x-2">
          <dt className="text-muted-foreground">
            {field.path.length === 0
              ? translator.t('adminSystem.result.value')
              : field.path.map(label).join(' / ')}
          </dt>
          <dd className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
            {field.value === null
              ? translator.t('adminSystem.result.empty')
              : typeof field.value === 'boolean'
                ? translator.t(field.value ? 'adminSystem.result.yes' : 'adminSystem.result.no')
                : String(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
