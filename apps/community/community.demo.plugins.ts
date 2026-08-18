import type { InstalledPlugin } from '@meith/core'
import { readPluginEnv } from '@meith/core'
import { dues, duesMessages } from '@meith/plugin-dues'
import type { PluginDefinition } from '@meith/plugin-kit'

const PLAIN_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export function testBoardEnabled(): boolean {
  return readPluginEnv('DUES_TEST_BOARD') === '1'
}

export function demoModeEnabled(): boolean {
  const flag = readPluginEnv('DEMO_MODE')
  return flag === '1' || flag === 'true'
}

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
    messages: duesMessages,
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
    messages: duesMessages,
    plugin: dues({
      currency: 'eur',
      graceDays: 7,
      extraRedirectHosts: boardHosts(),
    }),
  },
]

export function showcasePlugins(): readonly InstalledPlugin<PluginDefinition>[] {
  if (testBoardEnabled()) return testBoardPlugins()
  if (demoModeEnabled()) return demoPlugins()
  return []
}
