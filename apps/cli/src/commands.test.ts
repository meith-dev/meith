import { Readable } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const stored = new Map<string, string>()

const settings = {
  loadAll: async () => new Map(stored),
  save: async (entries: ReadonlyMap<string, string>) => {
    for (const [key, value] of entries) stored.set(key, value)
  },
  delete: async (keys: readonly string[]) => {
    for (const key of keys) stored.delete(key)
  },
}

vi.mock('./context', () => ({
  createContext: async () => ({ settings }),
}))

const { readSecretSettingValue, settingDisplayValue, settingsGet, settingsSet } = await import(
  './commands'
)
const { SETTING_DEFINITION_BY_KEY } = await import('@meith/settings')

const secretKey = 'federation.github_client_secret'
const marker = 'operator-secret-marker'
const lines: string[] = []

beforeEach(() => {
  stored.clear()
  lines.length = 0
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation((...values) => lines.push(values.join(' ')))
})

describe('secret setting output', () => {
  it('reports only whether a secret is set', async () => {
    stored.set(secretKey, marker)

    await settingsGet([secretKey])

    expect(lines).toEqual([`${secretKey} = <set>`])
    expect(lines.join('\n')).not.toContain(marker)
  })

  it('reports an absent secret as unset', async () => {
    await settingsGet([secretKey])

    expect(lines).toEqual([`${secretKey} = <unset>  (default)`])
  })

  it('redacts secret defaults in registry output formatting', () => {
    const definition = SETTING_DEFINITION_BY_KEY.get(secretKey)
    expect(definition).toBeDefined()
    expect(settingDisplayValue(definition!, definition!.default)).toBe('<unset>')
  })
})

describe('secret setting input', () => {
  it('writes a secret from a named environment variable without printing it', async () => {
    vi.stubEnv('MEITH_TEST_SECRET', marker)

    await settingsSet([secretKey, '--from-env', 'MEITH_TEST_SECRET'])

    expect(stored.get(secretKey)).toBe(marker)
    expect(lines).toEqual([`${secretKey} = <set>`])
    expect(lines.join('\n')).not.toContain(marker)
    vi.unstubAllEnvs()
  })

  it('reads piped input and removes one trailing newline', async () => {
    const value = await readSecretSettingValue(new Map(), Readable.from([`${marker}\n`]), {})

    expect(value).toBe(marker)
  })

  it('allows an empty environment value to clear a secret', async () => {
    stored.set(secretKey, marker)
    vi.stubEnv('MEITH_TEST_SECRET', '')

    await settingsSet([secretKey, '--from-env', 'MEITH_TEST_SECRET'])

    expect(stored.has(secretKey)).toBe(false)
    expect(lines).toEqual([`${secretKey} = <unset>`])
    expect(lines.join('\n')).not.toContain(marker)
    vi.unstubAllEnvs()
  })

  it('rejects a secret passed in argv without repeating it', async () => {
    const error = await settingsSet([secretKey, marker]).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('cannot be supplied as arguments')
    expect(String(error)).not.toContain(marker)
  })

  it('rejects missing and invalid named environment sources', async () => {
    await expect(
      readSecretSettingValue(new Map(), { isTTY: true, async *[Symbol.asyncIterator]() {} }, {}),
    ).rejects.toThrow('No secret supplied')
    await expect(
      readSecretSettingValue(new Map([['from-env', 'NOT-SET']]), Readable.from([]), {}),
    ).rejects.toThrow('valid environment variable name')
    await expect(
      readSecretSettingValue(
        new Map([['from-env', 'MEITH_MISSING_SECRET']]),
        Readable.from([]),
        {},
      ),
    ).rejects.toThrow('is not set')
  })

  it('rejects positional and named-environment sources together', async () => {
    await expect(
      settingsSet([secretKey, marker, '--from-env', 'MEITH_TEST_SECRET']),
    ).rejects.toThrow('cannot be supplied as arguments')
  })
})

describe('ordinary setting compatibility', () => {
  it('keeps positional values and visible output for non-secret settings', async () => {
    await settingsSet(['board.name', 'The Townland'])

    expect(stored.get('board.name')).toBe('The Townland')
    expect(lines).toEqual(['board.name = The Townland'])
  })
})
