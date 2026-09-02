import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
import { PLUGIN_CARD, type PluginDefinition, PluginHost } from '@meith/plugin-kit'

const ALPHA: PluginDefinition = {
  key: 'alpha',
  name: 'Alpha',
  version: '1.0.0',
  contributions: [
    { region: 'index.footer', render: () => 'from alpha' },
    {
      region: 'admin.dashboard',
      render: () => createElement('p', { 'data-plugin': 'alpha' }, 'alpha on the dashboard'),
    },
  ],
}

const host = new PluginHost({ plugins: [ALPHA] })

const operator = { disabled: [] as string[], syncs: 0 }
vi.mock('./plugin-host', () => ({
  pluginHost: host,
  syncPluginEnablement: async () => {
    operator.syncs += 1
    host.setOperatorDisabled(operator.disabled)
  },
}))

const { boardRegion, pluginRegion } = await import('./plugin-view')

const GUEST = { userId: null, isGuest: true } as const
const ACTOR: Actor = {
  userId: null,
  groupIds: [1],
  primaryGroupId: 1,
  state: 'guest',
  global: emptyPermissionSet(),
  permissionVersion: 0,
}

beforeEach(() => {
  operator.disabled = []
  operator.syncs = 0
  host.setOperatorDisabled([])
})

describe('pluginRegion', () => {
  it('renders a contribution from a plugin nobody has switched off', async () => {
    const rendered = await pluginRegion('index.footer', {
      viewer: GUEST,
      subjectId: null,
      authorId: null,
    })

    expect(rendered).not.toBeNull()
    expect(operator.syncs).toBe(1)
  })

  it('renders nothing for a plugin the operator switched off, in a process that has done nothing else', async () => {
    operator.disabled = ['alpha']

    const rendered = await pluginRegion('index.footer', {
      viewer: GUEST,
      subjectId: null,
      authorId: null,
    })

    expect(rendered).toBeNull()
  })

  it('reports the switch through health as well, without a prior call to warm it', async () => {
    operator.disabled = ['alpha']

    await pluginRegion('index.footer', { viewer: GUEST, subjectId: null, authorId: null })

    expect(host.health()[0]).toMatchObject({ key: 'alpha', enabled: false, operatorDisabled: true })
  })
})

describe('boardRegion', () => {
  it('carries the switch through to the board-wide regions too', async () => {
    operator.disabled = ['alpha']

    expect(await boardRegion('index.footer', ACTOR)).toBeNull()
    expect(operator.syncs).toBe(1)
  })

  it('shows an admin.dashboard contribution, each wrapped in the plugin card treatment', async () => {
    const node = await boardRegion('admin.dashboard', ACTOR, PLUGIN_CARD)
    expect(node).not.toBeNull()

    const html = renderToStaticMarkup(createElement(() => node as never))
    expect(html).toContain('alpha on the dashboard')
    expect(html).toContain(`class="${PLUGIN_CARD}"`)
  })

  it('renders nothing on the admin dashboard when the contributor is switched off', async () => {
    operator.disabled = ['alpha']

    expect(await boardRegion('admin.dashboard', ACTOR, PLUGIN_CARD)).toBeNull()
  })
})
