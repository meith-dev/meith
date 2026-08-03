/**
 * F68's writes, at the app layer.
 *
 * The claim this file exists for: **the editor validates with the same
 * functions the render path uses.** F26's `validateTokenOverrides` and
 * `validateCustomCss` run on every page load against the stored row; running
 * them again before the write is what makes "saved" mean "will render". A
 * second validator here would eventually disagree, and the direction it would
 * disagree in is the bad one — a value the editor accepts and the renderer
 * rejects is a board that goes blank on the next request, from an
 * administrator's own save.
 *
 * The other two: a blank field is "use the theme's value" and not an empty
 * override, and the preview runs the real validation rather than approximating
 * it in the browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
vi.mock('@forum/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
  }),
}))

const saved: Array<Record<string, unknown>> = []
const resets: string[] = []

/*
 * A stand-in theme with a handful of real token names. `background` is here
 * because F26 treats it specially — it has to be a colour it can convert for
 * `<meta name="theme-color">` — and that rule has to survive this screen.
 */
const TOKENS = {
  light: { background: '#ffffff', primary: '#334455', radius: '0.375rem' },
  dark: { background: '#111111', primary: '#88aacc', radius: '0.375rem' },
}

vi.mock('./theme-admin', () => ({
  requireThemeAdmin: () => ({
    async save(input: Record<string, unknown>) {
      saved.push(input)
    },
    async reset(key: string) {
      resets.push(key)
    },
  }),
  themeTokens: (key: string) => (key === 'default' ? TOKENS : null),
  themeTitle: (key: string) => (key === 'default' ? 'Default' : null),
}))

const {
  importThemeAction,
  previewThemeAction,
  resetThemeAction,
  saveThemeAction,
} = await import('./theme-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  saved.length = 0
  resets.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

describe('the admin gate', () => {
  it('is asked for on every write', async () => {
    await saveThemeAction({}, form({ key: 'default' }))
    await resetThemeAction({}, form({ key: 'default' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(2)
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveThemeAction({}, form({ key: 'default' }))
    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
    expect(invalidated).toEqual([])
  })

  it('refuses a theme the build does not have', async () => {
    /*
     * The key is a URL segment. A theme that is not in `forum.config.ts` cannot
     * render, so storing a row for one would be a customisation nothing will
     * ever apply.
     */
    const state = await saveThemeAction({}, form({ key: 'not-installed' }))
    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses an unknown key on reset too, which has no second check', async () => {
    /*
     * Save, preview and import all look the theme's tokens up afterwards and
     * would refuse anyway; **reset does not** — it needs no tokens, so
     * `themeKey` is the only thing standing between a URL segment and a DELETE.
     * Kills the mutant that drops that guard, which every other test in this
     * file survives.
     */
    const state = await resetThemeAction({}, form({ key: 'not-installed' }))

    expect(state.error).toBeDefined()
    expect(resets).toEqual([])
  })
})

describe('saveThemeAction', () => {
  it('treats a blank field as "use the theme’s value", not as an override', async () => {
    /*
     * Most fields are blank on any real board — the editor shows all
     * thirty-odd tokens. Storing those as empty strings would write
     * `--primary:;` into the cascade: a token that overrides the theme with
     * nothing. Kills the mutant that collects every field.
     */
    await saveThemeAction({}, form({ key: 'default', 'token.primary': '', 'token.radius': '1rem' }))

    expect(saved[0]?.tokenOverrides).toEqual({ radius: '1rem' })
  })

  it('stores what was typed for the tokens that were filled in', async () => {
    await saveThemeAction({}, form({ key: 'default', 'token.primary': '#abcdef' }))
    expect(saved[0]?.tokenOverrides).toEqual({ primary: '#abcdef' })
  })

  it('refuses a token the theme does not declare', async () => {
    /*
     * F26's rule, and the reason it matters: an override of a name no
     * stylesheet reads is accepted silently and then does nothing, which is
     * indistinguishable from the feature being broken.
     */
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.invented': '#abcdef' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a token value carrying a second declaration', async () => {
    /*
     * The value goes into a style block. `;` would close the declaration and
     * open another, which is a stylesheet injection from a form field. F26's
     * validator refuses it and this proves the editor runs that validator
     * rather than its own. Kills the mutant that writes without validating.
     */
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a background that is not a convertible colour', async () => {
    /*
     * `background` is special: F26 converts it for `<meta name="theme-color">`,
     * so a value it cannot convert breaks the render rather than the styling.
     */
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.background': 'papayawhip' }),
    )
    expect(state.error).toBeDefined()
  })

  it('refuses custom CSS that stops being CSS', async () => {
    for (const css of ['@import url(evil.css);', 'a{background:url(http://x/y)}', '</style><script>']) {
      const state = await saveThemeAction({}, form({ key: 'default', customCss: css }))
      expect(state.error, css).toBeDefined()
    }
    expect(saved).toEqual([])
  })

  it('stores blank custom CSS as null rather than an empty string', async () => {
    await saveThemeAction({}, form({ key: 'default', customCss: '   ' }))
    expect(saved[0]?.customCss).toBeNull()
  })

  it('clears the theme cache tag for that key alone', async () => {
    /*
     * The render path caches the rendered style block against `theme:<key>`.
     * A save that did not clear it would be a save an operator watches do
     * nothing. Kills the mutant that drops the invalidation.
     */
    await saveThemeAction({}, form({ key: 'default' }))
    expect(invalidated).toEqual([['theme:default']])
  })

  it('logs how much changed, never the values', async () => {
    await saveThemeAction(
      {},
      form({ key: 'default', 'token.primary': '#abcdef', customCss: '.x{color:red}' }),
    )

    expect(adminCalls[0]).toEqual({
      action: 'theme.saved',
      detail: { key: 'default', tokens: 1, customCss: true },
    })
    expect(JSON.stringify(adminCalls)).not.toContain('#abcdef')
  })
})

describe('previewThemeAction', () => {
  it('hands back a scoped style block and saves nothing', async () => {
    /*
     * Scoped to `[data-theme-preview]` rather than `:root`, so previewing an
     * unreadable colour cannot restyle the form that changes it back. Kills the
     * mutant that emits `:root`.
     */
    const state = await previewThemeAction({}, form({ key: 'default', 'token.primary': '#abcdef' }))

    expect(saved).toEqual([])
    expect(state.preview).toContain('[data-theme-preview]')
    expect(state.preview).toContain('--primary:#abcdef;')
    expect(state.preview).not.toContain(':root')
  })

  it('runs the same validation a save would, so a preview cannot hide a refusal', async () => {
    /*
     * A preview that approximated the rules in the browser would show an
     * operator something that then failed to save — or worse, showed nothing
     * wrong with a value the renderer would reject.
     */
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(state.preview).toBeUndefined()
  })

  it('keeps what was typed, so previewing does not empty the form', async () => {
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.primary': '#abcdef', customCss: '.x{color:red}' }),
    )

    expect(state.values?.['token.primary']).toBe('#abcdef')
    expect(state.values?.customCss).toBe('.x{color:red}')
  })

  it('never puts the style block where a form control could echo it', async () => {
    /*
     * Everything in `values` is rendered back into an input as text; `preview`
     * is the field this codebase reserves for trusted self-generated markup
     * (F36/F41). They must not be reachable by the same name.
     */
    const state = await previewThemeAction({}, form({ key: 'default', 'token.primary': '#abcdef' }))
    expect(state.values?.preview).toBeUndefined()
  })
})

describe('resetThemeAction', () => {
  it('deletes the customisation and clears the tag', async () => {
    const state = await resetThemeAction({}, form({ key: 'default' }))

    expect(state.notice).toBe('reset')
    expect(resets).toEqual(['default'])
    expect(invalidated).toEqual([['theme:default']])
  })
})

describe('importThemeAction', () => {
  it('applies a valid document', async () => {
    const document = JSON.stringify({
      version: 1,
      key: 'somebody-elses',
      tokenOverrides: { primary: '#abcdef' },
      customCss: '.x{color:red}',
    })

    const state = await importThemeAction({}, form({ key: 'default', document }))

    expect(state.notice).toBe('imported')
    /* The key in the file is ignored: copying a look between boards is the point. */
    expect(saved[0]).toMatchObject({
      key: 'default',
      tokenOverrides: { primary: '#abcdef' },
      customCss: '.x{color:red}',
    })
  })

  it('validates the values, not only the envelope', async () => {
    /*
     * A file that arrived by email is exactly as untrusted as a hand-edited
     * row. `parseThemeExport` checks the envelope; F26's validator checks what
     * is inside. Kills the mutant that trusts a well-formed document.
     */
    const document = JSON.stringify({
      version: 1,
      tokenOverrides: { primary: 'red;position:fixed' },
      customCss: null,
    })

    const state = await importThemeAction({}, form({ key: 'default', document }))
    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a document from a version it does not understand', async () => {
    const document = JSON.stringify({ version: 2, tokenOverrides: {}, customCss: null })
    const state = await importThemeAction({}, form({ key: 'default', document }))

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses text that is not a document at all', async () => {
    const state = await importThemeAction({}, form({ key: 'default', document: 'paste here' }))
    expect(state.error).toBeDefined()
  })
})
