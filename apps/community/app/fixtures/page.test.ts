import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ dataSource: 'fixture', theme: vi.fn(), translator: vi.fn() }))

vi.mock('@meith/core', () => ({
  env: {
    get DATA_SOURCE() {
      return state.dataSource
    },
  },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404')
  },
}))
vi.mock('@/server/theme', () => ({ currentTheme: state.theme }))
vi.mock('@/server/i18n', () => ({ getTranslator: state.translator }))
vi.mock('@/theme/gallery.fixture', () => ({ FixtureGallery: () => null }))

import FixturesPage from './page'

beforeEach(() => {
  state.dataSource = 'fixture'
  vi.clearAllMocks()
})

describe('theme fixture access', () => {
  it('previews staff presentation without looking up or changing an actor', async () => {
    const page = await FixturesPage({
      searchParams: Promise.resolve({ slot: 'PanelShell', variant: 'admincp' }),
    })
    expect(page.props.name).toBe('PanelShell')
    expect(page.props.variant).toBe('admincp')
  })

  it('is unavailable on database boards before loading preview services', async () => {
    state.dataSource = 'postgres'
    await expect(FixturesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('404')
    expect(state.theme).not.toHaveBeenCalled()
    expect(state.translator).not.toHaveBeenCalled()
  })

  it.each([
    { slot: '__proto__' },
    { slot: ['PostBit'] },
    { variant: 'unknown' },
    { variant: ['default'] },
  ])('rejects invalid preview parameters: %j', async (query) => {
    await expect(FixturesPage({ searchParams: Promise.resolve(query) })).rejects.toThrow('404')
  })
})
