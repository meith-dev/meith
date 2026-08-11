import type { InstalledPlugin } from '@meith/core'
import { readPluginEnv } from '@meith/core'
import { dues } from '@meith/plugin-dues'
import type { PluginDefinition } from '@meith/plugin-kit'

const DUES_TEST_BOARD = readPluginEnv('DUES_TEST_BOARD') === '1'
const DEMO_MODE = readPluginEnv('DEMO_MODE') === '1' || readPluginEnv('DEMO_MODE') === 'true'

const PLAIN_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

function boardHosts(): readonly string[] {
  const configured = readPluginEnv('APP_URL')
  if (configured === undefined) return ['127.0.0.1']

  try {
    const host = new URL(configured).hostname.toLowerCase()
    return PLAIN_HOST.test(host) ? [host] : ['127.0.0.1']
  } catch {
    return ['127.0.0.1']
  }
}

const testBoardPlugins = (): readonly InstalledPlugin<PluginDefinition>[] => [
  {
    key: 'dues',
    plugin: dues({
      currency: 'gbp',
      graceDays: 7,
      plans: [
        {
          key: 'supporter-month',
          name: 'Supporter',
          group: 'supporters',
          price: 500,
          billing: {
            mode: 'auto',
            interval: 'month',
            stripePriceId: 'price_e2e_supporter_month',
          },
          description: 'The board’s bills, split honestly. Renews monthly.',
        },
        {
          key: 'pass-90',
          name: '90-day pass',
          group: 'supporters',
          price: 1200,
          billing: { mode: 'fixed', period: 'P90D' },
          description: 'Three months among the supporters. Can be a gift.',
        },
      ],
      extraRedirectHosts: ['127.0.0.1'],
    }),
  },
]

const demoPlugins = (): readonly InstalledPlugin<PluginDefinition>[] => [
  {
    key: 'dues',
    plugin: dues({
      currency: 'eur',
      graceDays: 7,
      extraRedirectHosts: boardHosts(),
    }),
  },
]

export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = DUES_TEST_BOARD
  ? testBoardPlugins()
  : DEMO_MODE
    ? demoPlugins()
    : []

export function installedPluginDefinitions(): readonly PluginDefinition[] {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin as PluginDefinition)
}
