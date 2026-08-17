import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
const requireFreshAdminMock = vi.fn(async () => ({ session: { userId: 1 } }))
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
  requireFreshAdmin: () => requireFreshAdminMock(),
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

const TOKENS = {
  light: { background: '#ffffff', primary: '#334455', radius: '0.375rem' },
  dark: { background: '#111111', primary: '#88aacc', radius: '0.375rem' },
}

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
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ session: { userId: 1 } })
})

const staleProof = () =>
  Object.assign(new Error('confirm'), {
    code: 'FORBIDDEN',
    publicMessage: 'Confirm your password again before doing this.',
  })

describe('the admin gate', () => {
  it('is asked for on every write', async () => {
    await saveThemeAction({}, form({ key: 'default' }))
    await resetThemeAction({}, form({ key: 'default' }))
    await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))
    await setDefaultThemeAction({}, form({ key: 'midnight' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(3)
    expect(requireFreshAdminMock).toHaveBeenCalledTimes(1)
  })

  it('asks for a fresh password before throwing every override away', async () => {
    await resetThemeAction({}, form({ key: 'default' }))
    await importThemeAction(
      {},
      form({
        key: 'default',
        document: JSON.stringify({ version: 1, tokenOverrides: {}, customCss: null }),
      }),
    )

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(2)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('destroys nothing when the proof is stale', async () => {
    requireFreshAdminMock.mockRejectedValue(staleProof())

    const reset = await resetThemeAction({}, form({ key: 'default' }))
    const imported = await importThemeAction(
      {},
      form({
        key: 'default',
        document: JSON.stringify({
          version: 2,
          tokenOverrides: { light: { primary: '#abcdef' }, dark: {} },
          customCss: null,
        }),
      }),
    )

    expect(reset.error).toBeDefined()
    expect(imported.error).toBeDefined()
    expect(resets).toEqual([])
    expect(saved).toEqual([])
    expect(invalidated).toEqual([])
    expect(adminCalls).toEqual([])
  })

  it('lets the reversible writes through on the panel session alone', async () => {
    requireFreshAdminMock.mockRejectedValue(staleProof())

    const editing = await saveThemeAction({}, form({ key: 'default', 'token.both.radius': '1rem' }))
    const off = await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))
    const made = await setDefaultThemeAction({}, form({ key: 'midnight' }))

    expect(editing.notice).toBe('saved')
    expect(off.notice).toBe('disabled')
    expect(made.notice).toBe('default')
    expect(requireFreshAdminMock).not.toHaveBeenCalled()
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
    const state = await saveThemeAction({}, form({ key: 'not-installed' }))
    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses an unknown key on reset too, which has no second check', async () => {
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
    await saveThemeAction({}, form({ key: 'default', 'token.both.radius': '0px' }))

    expect(saved[0]?.tokenOverrides).toEqual({
      light: { radius: '0px' },
      dark: { radius: '0px' },
    })
  })

  it('refuses a token the theme does not declare', async () => {
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.light.invented': '#abcdef' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a token value carrying a second declaration', async () => {
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses an unsafe value in the dark scheme too', async () => {
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.dark.primary': 'red;position:fixed' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a background that is not a convertible colour', async () => {
    const state = await saveThemeAction(
      {},
      form({ key: 'default', 'token.light.background': 'papayawhip' }),
    )
    expect(state.error).toBeDefined()
  })

  it('refuses custom CSS that stops being CSS', async () => {
    for (const css of [
      '@import url(evil.css);',
      'a{background:url(http://x/y)}',
      '</style><script>',
    ]) {
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

    expect(adminCalls[0]).toEqual({
      action: 'theme.saved',
      detail: { key: 'default', tokens: 1, customCss: true },
    })
    expect(JSON.stringify(adminCalls)).not.toContain('#abcdef')
  })
})

describe('previewThemeAction', () => {
  it('hands back a scoped style block and saves nothing', async () => {
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

  it('nests the custom CSS inside the sample rather than letting it out', async () => {
    const state = await previewThemeAction(
      {},
      form({ key: 'default', customCss: 'body{display:none}' }),
    )

    expect(state.preview).toContain('[data-theme-preview]{body{display:none}}')
    expect(state.preview?.startsWith('body')).toBe(false)
  })

  it('runs the same validation a save would, so a preview cannot hide a refusal', async () => {
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
    const state = await previewThemeAction(
      {},
      form({ key: 'default', 'token.light.primary': '#abcdef' }),
    )
    expect(state.values?.preview).toBeUndefined()
  })
})

describe('themeEditorAction', () => {
  it('previews when the preview button was the submitter', async () => {
    const state = await themeEditorAction(
      {},
      form({ key: 'default', intent: 'preview', 'token.light.primary': '#abcdef' }),
    )

    expect(saved).toEqual([])
    expect(state.preview).toContain('--primary:#abcdef;')
  })

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
    const state = await setThemeEnabledAction({}, form({ key: 'default', enabled: 'false' }))

    expect(state.error).toBeDefined()
    expect(enabling).toEqual([])
  })

  it('refuses to disable the default, rather than quietly moving it', async () => {
    const listing = [
      { key: 'default', isDefault: false, enabled: true, isBuildTheme: true },
      { key: 'midnight', isDefault: true, enabled: true, isBuildTheme: false },
    ]
    LISTING.splice(0, LISTING.length, ...listing)

    const state = await setThemeEnabledAction({}, form({ key: 'midnight', enabled: 'false' }))

    LISTING.splice(
      0,
      LISTING.length,
      ...[
        { key: 'default', isDefault: true, enabled: true, isBuildTheme: true },
        { key: 'midnight', isDefault: false, enabled: true, isBuildTheme: false },
      ],
    )

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
    expect(saved[0]).toMatchObject({
      key: 'default',
      tokenOverrides: { light: { primary: '#abcdef' }, dark: { primary: '#123456' } },
      customCss: '.x{color:red}',
    })
  })

  it('reads a version 1 document, whose overrides meant both schemes', async () => {
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
