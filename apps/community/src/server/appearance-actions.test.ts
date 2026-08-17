import { beforeEach, describe, expect, it, vi } from 'vitest'

const jar = new Map<string, { value: string; options: Record<string, unknown> }>()

vi.mock('./redirect-back', () => ({ redirectToCurrentPath: async () => {} }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = jar.get(name)
      return entry === undefined ? undefined : { name, value: entry.value }
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.set(name, { value, options })
    },
  }),
}))

const choices = [
  { key: 'default', title: 'Default' },
  { key: 'midnight', title: 'Midnight' },
]
vi.mock('./theme-runtime', () => ({
  getBoardThemeStyle: async () => ({ choices, defaultKey: 'default' }),
}))

const { setAppearanceAction } = await import('./appearance-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  jar.clear()
})

describe('setAppearanceAction', () => {
  it('stores a colour scheme and nothing else', async () => {
    await setAppearanceAction(form({ scheme: 'dark' }))

    expect(jar.get('meith_scheme')?.value).toBe('dark')
    expect(jar.has('meith_theme')).toBe(false)
  })

  it('stores a theme and nothing else', async () => {
    await setAppearanceAction(form({ theme: 'midnight' }))

    expect(jar.get('meith_theme')?.value).toBe('midnight')
    expect(jar.has('meith_scheme')).toBe(false)
  })

  it('stores "system" as an answer rather than as silence', async () => {
    await setAppearanceAction(form({ scheme: 'system' }))
    expect(jar.get('meith_scheme')?.value).toBe('system')
  })

  it('refuses a colour scheme it does not have', async () => {
    await setAppearanceAction(form({ scheme: 'sepia' }))
    expect(jar.has('meith_scheme')).toBe(false)
  })

  it('refuses a theme the board does not offer', async () => {
    await setAppearanceAction(form({ theme: 'not-installed' }))
    expect(jar.has('meith_theme')).toBe(false)
  })

  it('sets cookies a browser will keep and send back', async () => {
    await setAppearanceAction(form({ scheme: 'light' }))

    const options = jar.get('meith_scheme')?.options
    expect(options?.path).toBe('/')
    expect(options?.sameSite).toBe('lax')
    expect(Number(options?.maxAge)).toBeGreaterThan(60 * 60 * 24 * 30)
  })
})
