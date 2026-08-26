import type { PluginAdminPageContext } from '@meith/plugin-kit'

import { endpointProblem, resolveWebhooksConfig } from '../config'
import en from '../messages/en.json'
import { counts } from '../queue'

function translated(context: PluginAdminPageContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}

export async function StatusPage(context: PluginAdminPageContext) {
  const config = resolveWebhooksConfig(context.settings)
  const problem = endpointProblem(config)

  const queue = problem === null ? await counts(context.data).catch(() => null) : null

  return (
    <div className="flex flex-col gap-3 text-sm">
      {problem !== null && (
        <p className="text-muted-foreground">
          {translated(
            context,
            problem === 'missing'
              ? 'webhooks.admin.status.endpoint.missing'
              : 'webhooks.admin.status.endpoint.insecure',
          )}
        </p>
      )}

      {queue !== null && (
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-muted-foreground">
              {translated(context, 'webhooks.admin.status.pending')}
            </dt>
            <dd className="text-lg tabular-nums">{queue.pending}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {translated(context, 'webhooks.admin.status.delivered')}
            </dt>
            <dd className="text-lg tabular-nums">{queue.delivered}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {translated(context, 'webhooks.admin.status.dead')}
            </dt>
            <dd className="text-lg tabular-nums">{queue.dead}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}
