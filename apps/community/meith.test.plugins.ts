import type { InstalledPlugin } from '@meith/core'
import { readPluginEnv } from '@meith/core'
import { messages as awardsMessages, plugin as awardsPlugin } from '@meith/plugin-awards'
import { calendarMessages, calendarPlugin } from '@meith/plugin-calendar'
import { createDues, duesMessages } from '@meith/plugin-dues'
import type { PluginDefinition } from '@meith/plugin-kit'

const testBoardPlugins = (): readonly InstalledPlugin<PluginDefinition>[] => [
  { key: 'awards', messages: awardsMessages, plugin: awardsPlugin },
  { key: 'calendar', messages: calendarMessages, plugin: calendarPlugin },
  {
    key: 'dues',
    messages: duesMessages,
    plugin: createDues({
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

export function showcasePlugins(): readonly InstalledPlugin<PluginDefinition>[] {
  return readPluginEnv('DUES_TEST_BOARD') === '1' ? testBoardPlugins() : []
}
