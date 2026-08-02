/**
 * F64 — the generated form's field descriptors.
 *
 * The important test in this file is the last one. `ui.min`/`ui.max` restate
 * bounds the zod schema already enforces, because zod is not introspectable for
 * them without unwrapping every wrapper type — and a restatement free to drift
 * is exactly the kind of thing F08's registry exists to prevent. So every
 * declared bound is **probed against the schema that actually validates**: a
 * hint that disagrees fails here rather than shipping a number box that offers
 * values the save will refuse.
 */
import { describe, expect, it } from 'vitest'

import { SETTING_DEFINITIONS, SETTING_DEFINITION_BY_KEY } from './definitions'
import { coerceFormValue, settingField } from './fields'
import type { SettingDefinition } from './definitions'

function definition(key: string): SettingDefinition {
  const found = SETTING_DEFINITION_BY_KEY.get(key)
  if (found === undefined) throw new Error(`no such setting: ${key}`)
  return found
}

describe('settingField', () => {
  it('derives the kind from the default, not from a declaration', () => {
    /*
     * `typeof default` states the type as a *value*, which is the one place it
     * cannot disagree with itself. Kills the temptation to add a `kind` field.
     */
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
    /*
     * A secret that is also an enum is still a value that must not reach the
     * page. Kills the mutant that checks `options` first.
     */
    const secretEnum: SettingDefinition = {
      ...definition('registration.method'),
      secret: true,
    }
    expect(settingField(secretEnum).kind).toBe('secret')
  })
})

describe('coerceFormValue', () => {
  it('reads a missing checkbox as false, which a shell must never do', () => {
    /*
     * The one thing a form and a shell disagree about: an unchecked box submits
     * nothing at all. Sharing the CLI's `coerce` would make a missing argument
     * mean `false`, which is how `settings:set` would start silently turning
     * things off.
     */
    expect(coerceFormValue(definition('board.offline'), undefined)).toBe(false)
    expect(coerceFormValue(definition('board.offline'), '')).toBe(false)
    expect(coerceFormValue(definition('board.offline'), 'on')).toBe(true)
  })

  it('turns a numeric string into a number', () => {
    expect(coerceFormValue(definition('posting.flood_seconds'), '45')).toBe(45)
  })

  it('leaves a non-numeric string alone so the schema can name the problem', () => {
    /*
     * `Number('')` is 0 and `Number('abc')` is NaN, and both would reach the
     * schema *as a number* — one silently valid, the other reported as a range
     * error. Passing the string through gets "expected number", which is the
     * message an operator can act on.
     */
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
})

describe('every declared bound agrees with the schema that enforces it', () => {
  const numeric = SETTING_DEFINITIONS.filter(
    (d) => typeof d.default === 'number' && d.ui !== undefined,
  )

  it('covers every numeric setting, so a new one cannot skip this', () => {
    /*
     * The check is only worth anything if it is exhaustive: a numeric setting
     * with no `ui` hint renders an unbounded box, which is a silent downgrade
     * rather than a visible one.
     */
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

      /* And the default has to sit inside the box the operator is shown. */
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
      /* And nothing outside the list is offered as if it were valid. */
      expect(setting.schema.safeParse('not-an-option').success).toBe(false)
    })
  }
})
