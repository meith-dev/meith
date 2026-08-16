import type { Actor } from '@meith/authorization'
import { emptyPermissionSet } from '@meith/core'
import { PluginHost, type PluginDefinition } from '@meith/plugin-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ALPHA: PluginDefinition = {
  key: 'alpha',
  name: 'Alpha',
  version: '1.0.0',
  contributions: [{ region: 'index.footer', render: () => 'from alpha' }],
}

const host = new PluginHost({ plugins: [ALPHA] })

const operator = { disabled: [] as string[], syncs: 0 }
vi.mock('./plugin-host', () => ({
  pluginHost: host,
  syncOperatorDisables: async () => {
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
})
