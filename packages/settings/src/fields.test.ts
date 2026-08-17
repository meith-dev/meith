import { describe, expect, it } from 'vitest'

import type { SettingDefinition } from './definitions'
import { SETTING_DEFINITION_BY_KEY, SETTING_DEFINITIONS } from './definitions'
import { coerceFormValue, secretClearField, settingField } from './fields'

function definition(key: string): SettingDefinition {
  const found = SETTING_DEFINITION_BY_KEY.get(key)
  if (found === undefined) throw new Error(`no such setting: ${key}`)
  return found
}

describe('settingField', () => {
  it('derives the kind from the default, not from a declaration', () => {
    expect(settingField(definition('board.name')).kind).toBe('text')
    expect(settingField(definition('board.offline')).kind).toBe('boolean')
    expect(settingField(definition('posting.max_length')).kind).toBe('number')
  })

  it('uses a textarea only where one is asked for', () => {
    expect(settingField(definition('board.description')).kind).toBe('textarea')
    expect(settingField(definition('mail.from_name')).kind).toBe('text')
  })

  it('makes an enum a select, with the operator’s words', () => {
    const field = settingField(definition('registration.method'))
    expect(field.kind).toBe('select')
    expect(field.kind === 'select' && field.options.map((o) => o.value)).toEqual([
      'none',
      'email',
      'admin',
      'both',
    ])
  })

  it('carries a number’s bounds through to the control', () => {
    const field = settingField(definition('posting.flood_seconds'))
    expect(field).toEqual({ kind: 'number', min: 0, max: 3600 })
  })

  it('makes a secret a secret whatever else it is', () => {
    const secretEnum: SettingDefinition = {
      ...definition('registration.method'),
      secret: true,
    }
    expect(settingField(secretEnum).kind).toBe('secret')
  })
})

describe('coerceFormValue', () => {
  it('reads a missing checkbox as false, which a shell must never do', () => {
    expect(coerceFormValue(definition('board.offline'), undefined)).toBe(false)
    expect(coerceFormValue(definition('board.offline'), '')).toBe(false)
    expect(coerceFormValue(definition('board.offline'), 'on')).toBe(true)
  })

  it('turns a numeric string into a number', () => {
    expect(coerceFormValue(definition('posting.flood_seconds'), '45')).toBe(45)
  })

  it('leaves a non-numeric string alone so the schema can name the problem', () => {
    expect(coerceFormValue(definition('posting.flood_seconds'), 'abc')).toBe('abc')
    expect(coerceFormValue(definition('posting.flood_seconds'), '  ')).toBe('  ')
  })

  it('treats an empty secret box as "unchanged", not as "set it to empty"', () => {
    const secret: SettingDefinition = { ...definition('mail.from_name'), secret: true }
    expect(coerceFormValue(secret, '')).toBeUndefined()
    expect(coerceFormValue(secret, 'hunter2')).toBe('hunter2')
  })

  it('passes a string through', () => {
    expect(coerceFormValue(definition('board.name'), ' My board ')).toBe(' My board ')
  })

  it('clears a secret back to its default when the clear box is ticked', () => {
    const secret = definition('mail.http_token')
    expect(coerceFormValue(secret, '', { clear: true })).toBe(secret.default)
    expect(coerceFormValue(secret, undefined, { clear: true })).toBe(secret.default)
  })

  it('lets clearing win over anything typed into the box in the same submit', () => {
    const secret = definition('mail.smtp_password')
    expect(coerceFormValue(secret, 'hunter2', { clear: true })).toBe(secret.default)
  })

  it('leaves a non-secret alone when the clear flag arrives for it', () => {
    expect(coerceFormValue(definition('board.name'), 'Still here', { clear: true })).toBe(
      'Still here',
    )
  })
})

describe('secretClearField', () => {
  it('never collides with the name of a setting', () => {
    const names = new Set<string>(SETTING_DEFINITIONS.map((d) => d.key))
    for (const d of SETTING_DEFINITIONS) {
      expect(names.has(secretClearField(d.key))).toBe(false)
    }
  })
})

describe('every declared bound agrees with the schema that enforces it', () => {
  const numeric = SETTING_DEFINITIONS.filter(
    (d) => typeof d.default === 'number' && d.ui !== undefined,
  )

  it('covers every numeric setting, so a new one cannot skip this', () => {
    const allNumeric = SETTING_DEFINITIONS.filter((d) => typeof d.default === 'number')
    expect(numeric).toHaveLength(allNumeric.length)
  })

  for (const setting of numeric) {
    it(`${setting.key}`, () => {
      const { min, max } = setting.ui ?? {}
      expect(min ?? max).toBeDefined()

      if (min !== undefined) {
        expect(setting.schema.safeParse(min).success).toBe(true)
        expect(setting.schema.safeParse(min - 1).success).toBe(false)
      }
      if (max !== undefined) {
        expect(setting.schema.safeParse(max).success).toBe(true)
        expect(setting.schema.safeParse(max + 1).success).toBe(false)
      }

      expect(setting.schema.safeParse(setting.default).success).toBe(true)
    })
  }
})

describe('every select’s options agree with its schema', () => {
  for (const setting of SETTING_DEFINITIONS.filter((d) => d.ui?.options !== undefined)) {
    it(`${setting.key}`, () => {
      for (const option of setting.ui!.options!) {
        expect(setting.schema.safeParse(option.value).success).toBe(true)
      }
      expect(setting.schema.safeParse('not-an-option').success).toBe(false)
    })
  }
})
