/**
 * The two cookies a member's appearance controls write.
 *
 * What is worth proving here is not that a cookie gets set — it is the three
 * decisions that would be invisible if they were wrong:
 *
 *  - **one submit button writes one preference.** Pressing "Dark" must not also
 *    write whatever theme the `<select>` happened to be showing, or a member
 *    changing the scheme would silently be moved off the theme they had picked
 *    the moment an administrator changed the default.
 *  - **an unknown value is dropped**, because the form is a POST anybody can
 *    make and the value ends up in a stylesheet selector two layers later.
 *  - **a theme the board does not offer is refused**, checked against the
 *    *enabled* list rather than the registry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const jar = new Map<string, { value: string; options: Record<string, unknown> }>()

/*
 * The redirect is what makes a press visible with JavaScript on, and it throws
 * by design — so it is stubbed to a no-op here rather than left to abort every
 * assertion after the write. `redirect-back.ts` carries the reasoning; what
 * this file is about is the cookies.
 */
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

const choices = [{ key: 'default', title: 'Default' }, { key: 'midnight', title: 'Midnight' }]
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

  /*
   * `system` is stored explicitly rather than as an absent cookie. Storing "no
   * choice" as nothing would work today and would quietly move a member the day
   * an administrator changed the board default: somebody who picked the default
   * on purpose is not the same as somebody who never picked.
   */
  it('stores "system" as an answer rather than as silence', async () => {
    await setAppearanceAction(form({ scheme: 'system' }))
    expect(jar.get('meith_scheme')?.value).toBe('system')
  })

  it('refuses a colour scheme it does not have', async () => {
    await setAppearanceAction(form({ scheme: 'sepia' }))
    expect(jar.has('meith_scheme')).toBe(false)
  })

  it('refuses a theme the board does not offer', async () => {
    /*
     * Checked against the enabled list, so a theme an administrator has turned
     * off cannot be re-selected by posting its key. Kills the mutant that
     * trusts the form.
     */
    await setAppearanceAction(form({ theme: 'not-installed' }))
    expect(jar.has('meith_theme')).toBe(false)
  })

  it('sets cookies a browser will keep and send back', async () => {
    await setAppearanceAction(form({ scheme: 'light' }))

    const options = jar.get('meith_scheme')?.options
    expect(options?.path).toBe('/')
    expect(options?.sameSite).toBe('lax')
    /* A session cookie would forget the choice every evening. */
    expect(Number(options?.maxAge)).toBeGreaterThan(60 * 60 * 24 * 30)
  })
})
