import { describe, expect, it } from 'vitest'

import { createTranslator } from '@meith/i18n'
import {
  type PluginRegionContext,
  type PluginRuntimeContext,
  unavailablePluginRuntime,
} from '@meith/plugin-kit'

import en from '../messages/en.json'
import { ThreadEventCard } from './thread-card'

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'type' in node) {
    const element = node as { type: unknown; props?: { children?: unknown } }
    if (typeof element.type === 'function') {
      return textOf((element.type as (props: unknown) => unknown)(element.props ?? {}))
    }
    return textOf(element.props?.children)
  }
  return ''
}

const EVENT_ROW = {
  id: 1,
  title: 'Launch party',
  starts_at: new Date('2999-01-01T18:00:00Z'),
  ends_at: null,
  location: 'The hall',
  thread_id: 42,
  created_by_user_id: 1,
  link_url: 'https://example.com/rsvp',
  link_label: '',
}

function runtime(): PluginRegionContext['runtime'] {
  const context = {
    ...unavailablePluginRuntime('a test'),
    data: {
      async query() {
        return [EVENT_ROW]
      },
      async one() {
        return EVENT_ROW
      },
      async tx<T>(work: (inner: unknown) => Promise<T>) {
        return work(null)
      },
    },
  } as unknown as PluginRuntimeContext
  return () => Promise.resolve(context)
}

function frenchContext(): PluginRegionContext {
  const t = createTranslator({
    locale: 'fr',
    catalog: {
      'calendar.thread.card': 'Ce fil concerne un événement.',
      'calendar.event.linkFallback': 'Ouvrir le lien',
    },
  })

  return {
    region: 'thread.header',
    viewer: { userId: null, isGuest: true },
    subjectId: 42,
    authorId: null,
    locale: t.locale,
    t,
    runtime: runtime(),
  }
}

describe('the calendar thread card', () => {
  it('renders its labels from the catalogue, not the bundled English', async () => {
    const node = await ThreadEventCard(frenchContext())
    expect(node).not.toBeNull()

    const text = textOf(node)
    expect(text).toContain('Ce fil concerne un événement.')
    expect(text).toContain('Ouvrir le lien')
    expect(text).not.toContain(en['calendar.thread.card'])
    expect(text).not.toContain(en['calendar.event.linkFallback'])
  })

  it('falls back to the bundled English when the catalogue lacks the key', async () => {
    const t = createTranslator({ locale: 'fr', catalog: {} })
    const node = await ThreadEventCard({ ...frenchContext(), locale: t.locale, t })
    expect(node).not.toBeNull()

    const text = textOf(node)
    expect(text).toContain(en['calendar.thread.card'])
  })
})
