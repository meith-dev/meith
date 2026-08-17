import { describe, expect, it } from 'vitest'

import { type PluginNotifyBackend, pluginNotificationKindSpecs, pluginNotify } from './runtime'

const KINDS = [
  { key: 'gift_received', title: 'A gift arrives', description: 'Somebody bought you in.' },
  {
    key: 'renewal_trouble',
    title: 'A renewal fails',
    description: 'Your card did not go through.',
    emailByDefault: false,
  },
]

function backend(): { raised: Array<Record<string, unknown>>; port: PluginNotifyBackend } {
  const raised: Array<Record<string, unknown>> = []
  return {
    raised,
    port: {
      raise: async (input) => {
        raised.push(input as Record<string, unknown>)
        return {}
      },
    },
  }
}

describe('pluginNotificationKindSpecs', () => {
  it('namespaces the id and fills the registry shape', () => {
    expect(pluginNotificationKindSpecs('dues', KINDS)).toEqual([
      {
        id: 'plugin.dues.gift_received',
        title: 'A gift arrives',
        description: 'Somebody bought you in.',
        audience: 'member',
        emailByDefault: true,
        emailConfigurable: true,
      },
      {
        id: 'plugin.dues.renewal_trouble',
        title: 'A renewal fails',
        description: 'Your card did not go through.',
        audience: 'member',
        emailByDefault: false,
        emailConfigurable: true,
      },
    ])
  })
})

describe('pluginNotify', () => {
  it('sends a declared kind, namespaced, with the words in the data', async () => {
    const { raised, port } = backend()
    const notify = pluginNotify('dues', KINDS, port)

    await notify.send({
      userId: 7,
      kind: 'gift_received',
      subject: 'You were gifted a 90-day pass',
      body: 'From alice.',
      href: '/plugins/dues/manage',
      dedupeKey: 'order:12',
    })

    expect(raised).toEqual([
      {
        userId: 7,
        kind: 'plugin.dues.gift_received',
        data: { subject: 'You were gifted a 90-day pass', body: 'From alice.' },
        href: '/plugins/dues/manage',
        dedupeKey: 'order:12',
      },
    ])
  })

  it('omits an empty body from the data', async () => {
    const { raised, port } = backend()
    await pluginNotify('dues', KINDS, port).send({
      userId: 7,
      kind: 'gift_received',
      subject: 'Hello',
    })
    expect(raised[0]?.data).toEqual({ subject: 'Hello' })
  })

  it('refuses an undeclared kind, a bad user, a silly subject, and an offsite href', async () => {
    const { raised, port } = backend()
    const notify = pluginNotify('dues', KINDS, port)

    await expect(notify.send({ userId: 7, kind: 'made_up', subject: 'x' })).rejects.toThrow(
      /not declared/,
    )
    await expect(notify.send({ userId: 0, kind: 'gift_received', subject: 'x' })).rejects.toThrow(
      /user id/,
    )
    await expect(notify.send({ userId: 7, kind: 'gift_received', subject: '   ' })).rejects.toThrow(
      /subject/,
    )
    await expect(
      notify.send({ userId: 7, kind: 'gift_received', subject: 'x'.repeat(201) }),
    ).rejects.toThrow(/subject/)
    await expect(
      notify.send({ userId: 7, kind: 'gift_received', subject: 'x', body: 'b'.repeat(2001) }),
    ).rejects.toThrow(/body/)
    await expect(
      notify.send({
        userId: 7,
        kind: 'gift_received',
        subject: 'x',
        href: 'https://evil.example/',
      }),
    ).rejects.toThrow(/href/)
    await expect(
      notify.send({ userId: 7, kind: 'gift_received', subject: 'x', href: '//evil.example' }),
    ).rejects.toThrow(/href/)

    expect(raised).toHaveLength(0)
  })
})
