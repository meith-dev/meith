import type { Metadata } from 'next'

import {
  CreateWebhookForm,
  DeleteWebhookForm,
  ToggleWebhookForm,
} from '@/components/admin/webhook-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { buildWebhookView } from '@/server/webhooks-admin'
import { webhookFormsCopy } from '@/view/admin-panel-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.webhooks') }
}

export default async function AdminWebhooksPage() {
  if ((await adminPageContext()) === null) return null

  const now = new Date()
  const translator = await getTranslator()
  const copy = webhookFormsCopy(translator)
  const view = await buildWebhookView()

  if (view === null) {
    return (
      <PanelPage title={await tr('page.webhooks')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-c')}
        </p>
      </PanelPage>
    )
  }

  const statusLabel: Record<string, string> = {
    delivered: translator.t('adminWebhooks.delivered'),
    pending: translator.t('adminWebhooks.pending'),
    dead: translator.t('adminWebhooks.dead'),
  }

  return (
    <PanelPage
      title={await tr('page.webhooks')}
      lede={translator.t('adminWebhooks.lede')}
      gap="loose"
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminWebhooks.add')}</h2>
        <CreateWebhookForm topics={view.topics} formats={view.formats} copy={copy} />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminWebhooks.existing')}
        </h2>

        {view.subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translator.t('adminWebhooks.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {view.subscriptions.map((subscription) => (
              <li
                key={subscription.id}
                className="flex flex-col gap-3 rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="overflow-x-auto font-mono text-xs">{subscription.url}</code>
                  <span
                    className={
                      subscription.active ? 'text-moderation-approved' : 'text-muted-foreground'
                    }
                  >
                    {subscription.active
                      ? translator.t('adminWebhooks.state.active')
                      : translator.t('adminWebhooks.state.paused')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {subscription.topics.map((topic) => (
                    <code key={topic} className="font-mono text-xs text-muted-foreground">
                      {topic}
                    </code>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  <code className="font-mono">{subscription.format}</code>
                  {' · '}
                  {statusLabel.delivered}: {subscription.delivered}
                  {' · '}
                  {statusLabel.pending}: {subscription.pending}
                  {' · '}
                  {statusLabel.dead}: {subscription.dead}
                </p>

                {subscription.recent.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium">
                      {translator.t('adminWebhooks.recent')}
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {subscription.recent.map((entry) => (
                            <tr key={entry.id} className="border-b border-border align-top">
                              <td className="py-1 pr-3 font-mono">{entry.topic}</td>
                              <td className="py-1 pr-3">
                                {statusLabel[entry.status] ?? entry.status}
                              </td>
                              <td className="py-1 pr-3">{entry.attempts}</td>
                              <td className="py-1 pr-3 font-mono">
                                {entry.lastStatusCode ?? entry.lastError ?? ''}
                              </td>
                              <td className="py-1">
                                {formatTime(entry.createdAt, now, translator).label}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <ToggleWebhookForm
                    webhookId={subscription.id}
                    active={subscription.active}
                    copy={copy}
                  />
                  <DeleteWebhookForm webhookId={subscription.id} copy={copy} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelPage>
  )
}
