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
 * The others: a blank field is "use the theme's value" and not an empty
 * override, light and dark are separate overrides while a token that has no
 * such distinction posts once, the preview runs the real validation rather than
 * approximating it in the browser, and the two state writes refuse the changes
 * that would leave a board unable to render itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
/**
 * `revalidatePath` outside a Next request throws, so an unmocked call turns a
 * successful action into an error state and the failure reads as a broken
 * write. Recorded rather than only silenced: which screen an action refreshes
 * is a claim worth asserting — see the cases that read `revalidated`.
 *
 * Spread the real module rather than replacing it. `next/cache` also exports
 * `unstable_cache`, which modules reached transitively from here call at import
 * time, so a mock returning only `revalidatePath` makes the file fail to load.
 */
const revalidated: string[] = []
vi.mock('next/cache', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    revalidatePath: (path: string) => {
      revalidated.push(path)
    },
  }
})

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireAdminMock(),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
vi.mock('@meith/drivers', () => ({
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
const enabling: Array<{ key: string; enabled: boolean }> = []
const defaults: string[] = []

/*
 * A stand-in theme with a handful of real token names. `background` is here
 * because F26 treats it specially — it has to be a colour it can convert for
 * `<meta name="theme-color">` — and that rule has to survive this screen.
 */
const TOKENS = {
  light: { background: '#ffffff', primary: '#334455', radius: '0.375rem' },
  dark: { background: '#111111', primary: '#88aacc', radius: '0.375rem' },
}

/** `default` is the build's theme; `midnight` is registered beside it. */
const LISTING = [
  { key: 'default', isDefault: true, enabled: true, isBuildTheme: true },
  { key: 'midnight', isDefault: false, enabled: true, isBuildTheme: false },
]

vi.mock('./theme-admin', () => ({
  requireThemeAdmin: () => ({
    async save(input: Record<string, unknown>) {
      saved.push(input)
    },
    async reset(key: string) {
      resets.push(key)
    },
    async setEnabled(key: string, enabled: boolean) {
      enabling.push({ key, enabled })
    },
    async setDefault(key: string) {
      defaults.push(key)
    },
  }),
  themeTokens: (key: string) => (key === 'default' || key === 'midnight' ? TOKENS : null),
  themeTitle: (key: string) =>
    key === 'default' ? 'Default' : key === 'midnight' ? 'Midnight' : null,
  themeListing: async () => LISTING,
  isBuildTheme: (key: string) => key === 'default',
}))

const {
  importThemeAction,
  previewThemeAction,
  resetThemeAction,
  saveThemeAction,
  setDefaultThemeAction,
  setThemeEnabledAction,
  themeEditorAction,
} = await import('./theme-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  revalidated.length = 0
  saved.length = 0
  resets.length = 0
  enabling.length = 0
  defaults.length = 0
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

describe('the admin gate', () => {
  it('is asked for on every write', async () => {
    await saveThemeAction({}, form({ key: 'default' }))
    await resetThemeAction({}, form({ key: 'default' }))
    await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))
    await setDefaultThemeAction({}, form({ key: 'midnight' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(4)
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
     * The key is a URL segment. A theme that is not in `community.config.ts` cannot
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

  it('refuses an unknown key on the state writes as well', async () => {
    const off = await setThemeEnabledAction({}, form({ key: 'not-installed', enabled: 'false' }))
    const made = await setDefaultThemeAction({}, form({ key: 'not-installed' }))

    expect(off.error).toBeDefined()
    expect(made.error).toBeDefined()
    expect(enabling).toEqual([])
    expect(defaults).toEqual([])
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
    await saveThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': '', 'token.both.radius': '1rem' }),
    )

    expect(saved[0]?.tokenOverrides).toEqual({
      light: { radius: '1rem' },
      dark: { radius: '1rem' },
    })
  })

  it('keeps light and dark apart', async () => {
    /*
     * The whole reason the shape changed. One value for both schemes is fine
     * for a corner radius and wrong for every colour: a board that set its page
     * background to white used to get white in dark mode too, and the only way
     * to avoid that was to not use the editor.
     */
    await saveThemeAction(
      {},
      form({
        key: 'default',
        'token.light.primary': '#0a58ca',
        'token.dark.primary': '#6ea8fe',
      }),
    )

    expect(saved[0]?.tokenOverrides).toEqual({
      light: { primary: '#0a58ca' },
      dark: { primary: '#6ea8fe' },
    })
  })

  it('expands a scheme-independent token into both schemes', async () => {
    /*
     * `both` is how the editor posts a token with no light/dark distinction. It
     * is expanded here rather than stored as a third key, because the render
     * path has exactly two blocks to write and a stored `both` would need a
     * rule in every reader. Kills the mutant that writes it to light only.
     */
    await saveThemeAction({}, form({ key: 'default', 'token.both.radius': '0px' }))

    expect(saved[0]?.tokenOverrides).toEqual({
      light: { radius: '0px' },
      dark: { radius: '0px' },
    })
  })

  it('refuses a token the theme does not declare', async () => {
    /*
     * F26's rule, and the reason it matters: an override of a name no
     * stylesheet reads is accepted silently and then does nothing, which is
     * indistinguishable from the feature being broken.
     */
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.light.invented': '#abcdef' }),
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
      form({ key: 'default', 'token.light.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses an unsafe value in the dark scheme too', async () => {
    /*
     * Two schemes means two ways in. A validator that only walked `light` would
     * pass every test above and let the same injection through one field to the
     * right.
     */
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.dark.primary': 'red;position:fixed' }),
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
      form({ key: 'default', 'token.light.background': 'papayawhip' }),
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
     * The render path caches the whole cascade against every registered theme's
     * tag, so clearing one key is enough to drop it — and clearing *this* key
     * is what says which theme changed. A save that cleared nothing would be a
     * save an operator watches do nothing.
     */
    await saveThemeAction({}, form({ key: 'default' }))
    expect(invalidated).toEqual([['theme:default']])
  })

  it('logs how much changed, never the values', async () => {
    await saveThemeAction(
      {},
      form({
        key: 'default',
        'token.light.primary': '#abcdef',
        'token.dark.primary': '#123456',
        customCss: '.x{color:red}',
      }),
    )

    /* One token, changed in two schemes — the count is of tokens, not fields. */
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
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': '#abcdef' }),
    )

    expect(saved).toEqual([])
    expect(state.preview).toContain('[data-theme-preview]')
    expect(state.preview).toContain('--primary:#abcdef;')
    expect(state.preview).not.toContain(':root')
  })

  it('scopes the dark values to the sample that is in dark mode', async () => {
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.dark.primary': '#abcdef' }),
    )

    expect(state.preview).toContain('[data-theme-preview].dark{--primary:#abcdef;}')
  })

  /*
   * The tokens were carefully scoped and then arbitrary author CSS was appended
   * unscoped, so previewing `body{display:none}` blanked the control panel that
   * would have undone it. Nesting it under the same attribute is what
   * `renderBoardStyle` already does for an alternate theme's CSS.
   */
  it('nests the custom CSS inside the sample rather than letting it out', async () => {
    const state = await previewThemeAction(
      {},
      form({ key: 'default', customCss: 'body{display:none}' }),
    )

    expect(state.preview).toContain('[data-theme-preview]{body{display:none}}')
    expect(state.preview?.startsWith('body')).toBe(false)
  })

  it('runs the same validation a save would, so a preview cannot hide a refusal', async () => {
    /*
     * A preview that approximated the rules in the browser would show an
     * operator something that then failed to save — or worse, showed nothing
     * wrong with a value the renderer would reject.
     */
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(state.preview).toBeUndefined()
  })

  it('keeps what was typed, so previewing does not empty the form', async () => {
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': '#abcdef', customCss: '.x{color:red}' }),
    )

    expect(state.values?.['token.light.primary']).toBe('#abcdef')
    expect(state.values?.customCss).toBe('.x{color:red}')
  })

  it('never puts the style block where a form control could echo it', async () => {
    /*
     * Everything in `values` is rendered back into an input as text; `preview`
     * is the field this codebase reserves for trusted self-generated markup
     * (F36/F41). They must not be reachable by the same name.
     */
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': '#abcdef' }),
    )
    expect(state.values?.preview).toBeUndefined()
  })
})

/**
 * The router the editor's single form posts to.
 *
 * It exists because two `useActionState` hooks on one form silently lose the
 * second one's result when the browser has no JavaScript — both write an
 * `$ACTION_KEY` field, both are posted, and the form's own action wins. The
 * consequence was a preview that returned a validated style block the page then
 * threw away. That is a wiring failure no unit test of either action could
 * catch, so what is asserted here is the wiring: which action a given submitter
 * reaches.
 */
describe('themeEditorAction', () => {
  it('previews when the preview button was the submitter', async () => {
    const state = await themeEditorAction(
      {},
      form({ key: 'default', intent: 'preview', 'token.light.primary': '#abcdef' }),
    )

    expect(saved).toEqual([])
    expect(state.preview).toContain('--primary:#abcdef;')
  })

  /*
   * Save is the default rather than a second `intent` value, so a browser that
   * submits the form without a submitter — the Enter key in a text field — does
   * the thing the form is for.
   */
  it('saves when no intent is given at all', async () => {
    const state = await themeEditorAction(
      {},
      form({ key: 'default', 'token.light.primary': '#abcdef' }),
    )

    expect(state.notice).toBe('saved')
    expect(saved).toHaveLength(1)
  })

  it('saves when the save button was the submitter', async () => {
    await themeEditorAction({}, form({ key: 'default', intent: 'save' }))

    expect(saved).toHaveLength(1)
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

describe('setThemeEnabledAction', () => {
  it('turns an alternate theme off and on again', async () => {
    await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))
    await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'true' }))

    expect(enabling).toEqual([
      { key: 'midnight', enabled: false },
      { key: 'midnight', enabled: true },
    ])
    expect(invalidated).toEqual([['theme:midnight'], ['theme:midnight']])
  })

  it('refuses to disable the theme the build renders', async () => {
    /*
     * Its components are what every page is made of. Turning it off would leave
     * the board painting one theme's markup in another's palette — and the
     * control that did it would then be offering no way back.
     */
    const state = await setThemeEnabledAction({}, form({ key: 'default', enabled: 'false' }))

    expect(state.error).toBeDefined()
    expect(enabling).toEqual([])
  })

  it('refuses to disable the default, rather than quietly moving it', async () => {
    /*
     * Silently reassigning the default here would be a second, unrequested
     * change hidden inside the first. `default` is both the build's theme and
     * the default in this fixture, so the refusal above could pass for the
     * wrong reason — this proves the default check exists by asking for a
     * theme that is only the default.
     */
    const listing = [
      { key: 'default', isDefault: false, enabled: true, isBuildTheme: true },
      { key: 'midnight', isDefault: true, enabled: true, isBuildTheme: false },
    ]
    LISTING.splice(0, LISTING.length, ...listing)

    const state = await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))

    LISTING.splice(0, LISTING.length, ...[
      { key: 'default', isDefault: true, enabled: true, isBuildTheme: true },
      { key: 'midnight', isDefault: false, enabled: true, isBuildTheme: false },
    ])

    expect(state.error).toMatch(/default/)
    expect(enabling).toEqual([])
  })
})

describe('setDefaultThemeAction', () => {
  it('moves the default and records it', async () => {
    const state = await setDefaultThemeAction({}, form({ key: 'midnight' }))

    expect(state.notice).toBe('default')
    expect(defaults).toEqual(['midnight'])
    expect(invalidated).toEqual([['theme:midnight']])
    expect(adminCalls[0]).toEqual({ action: 'theme.default', detail: { key: 'midnight' } })
  })
})

describe('importThemeAction', () => {
  it('applies a valid document', async () => {
    const document = JSON.stringify({
      version: 2,
      key: 'somebody-elses',
      tokenOverrides: { light: { primary: '#abcdef' }, dark: { primary: '#123456' } },
      customCss: '.x{color:red}',
    })

    const state = await importThemeAction({}, form({ key: 'default', document }))

    expect(state.notice).toBe('imported')
    /* The key in the file is ignored: copying a look between boards is the point. */
    expect(saved[0]).toMatchObject({
      key: 'default',
      tokenOverrides: { light: { primary: '#abcdef' }, dark: { primary: '#123456' } },
      customCss: '.x{color:red}',
    })
  })

  it('reads a version 1 document, whose overrides meant both schemes', async () => {
    /*
     * Every export taken before members could switch themes is version 1 with a
     * flat map. Refusing them would break the one thing export exists for — and
     * the flat map's meaning is unambiguous, because `light` and `dark` are not
     * token names.
     */
    const document = JSON.stringify({
      version: 1,
      tokenOverrides: { primary: '#abcdef' },
      customCss: null,
    })

    const state = await importThemeAction({}, form({ key: 'default', document }))

    expect(state.notice).toBe('imported')
    expect(saved[0]?.tokenOverrides).toEqual({
      light: { primary: '#abcdef' },
      dark: { primary: '#abcdef' },
    })
  })

  it('validates the values, not only the envelope', async () => {
    /*
     * A file that arrived by email is exactly as untrusted as a hand-edited
     * row. `parseThemeExport` checks the envelope; F26's validator checks what
     * is inside. Kills the mutant that trusts a well-formed document.
     */
    const document = JSON.stringify({
      version: 2,
      tokenOverrides: { light: { primary: 'red;position:fixed' }, dark: {} },
      customCss: null,
    })

    const state = await importThemeAction({}, form({ key: 'default', document }))
    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a document from a version it does not understand', async () => {
    const document = JSON.stringify({ version: 3, tokenOverrides: {}, customCss: null })
    const state = await importThemeAction({}, form({ key: 'default', document }))

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses text that is not a document at all', async () => {
    const state = await importThemeAction({}, form({ key: 'default', document: 'paste here' }))
    expect(state.error).toBeDefined()
  })
})

/**
 * The two screens a theme write is read back from.
 *
 * The tag above is the board's own cache — what makes the *next* render paint
 * the new colours. This is Next's client Router Cache, which holds the payload
 * the form was rendered with: without it, turning a theme off left its row still
 * offering **Turn off**, and making one the default left the badge on the theme
 * that had just stopped being it. On the control an administrator reaches for
 * *because a theme is breaking the board*, that is the screen telling them the
 * press did nothing.
 */
describe('the screens a theme write is read back from', () => {
  it('are refreshed when a theme is turned off', async () => {
    await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))
    expect(revalidated).toEqual(['/admin/themes', '/admin/themes/[key]'])
  })

  it('are refreshed when the default moves', async () => {
    await setDefaultThemeAction({}, form({ key: 'midnight' }))
    expect(revalidated).toEqual(['/admin/themes', '/admin/themes/[key]'])
  })
})
