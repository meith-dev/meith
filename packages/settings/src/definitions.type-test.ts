/**
 * Proof that the settings registry's types are not inert.
 *
 * `SettingKey` and `SettingValue<K>` exist so that `settings.get('board.nmae')`
 * is a compile error and `settings.get('board.name')` is a `string`. Neither
 * was true. `define<T>(d: SettingDefinitionBase<T>): SettingDefinition<T>`
 * widened every entry's `key` from its literal to `string`, so:
 *
 *  - `SettingKey` was `string`, and any key at all type-checked;
 *  - `SettingValue<K>` was `Extract<{ key: string, … }, { key: K }>['default']`,
 *    and a `{ key: string }` member does not extend `{ key: 'board.name' }`, so
 *    the `Extract` produced `never` — for every key on the board.
 *
 * `never` is assignable to everything, which is why nobody noticed for the
 * lifetime of the feature: `const title: string = settings.get('board.name')`
 * compiles perfectly when the right-hand side is `never`. It surfaced the first
 * time somebody called a *method* on the result — `.trim()` — which is not a
 * thing you can do to `never`.
 *
 * That is the same rule again, in the type system rather than in a guard: an
 * assertion that has quietly stopped asserting is worse than no assertion, so
 * this file is the deliberate violation, made permanent. It runs under
 * `pnpm typecheck` and fails in **both** directions:
 *
 *  - if the key type widens again, the `@ts-expect-error` lines below stop
 *    erroring and TypeScript reports them as unused;
 *  - if it narrows wrongly and rejects a real key, the accepted block fails.
 *
 * No runtime here on purpose — this is checked by the compiler, not by vitest,
 * which is why the name ends `.type-test.ts` rather than `.test.ts`.
 */

import type { SettingKey, SettingValue } from './definitions'

const NAME: SettingValue<'board.name'> = 'The Townland'
const OFFLINE: SettingValue<'board.offline'> = false
const PER_PAGE: SettingValue<'display.posts_per_page'> = 20
const MODE: SettingValue<'registration.method'> = 'none'

const KEY: SettingKey = 'board.name'

// @ts-expect-error — 'not.a.setting' is not a declared key
const UNKNOWN_KEY: SettingKey = 'not.a.setting'

// @ts-expect-error — board.name is a string, not a number
const WRONG_TYPE: SettingValue<'board.name'> = 42

// @ts-expect-error — board.offline is a boolean
const WRONG_SHAPE: SettingValue<'board.offline'> = 'yes'

// @ts-expect-error — 'board.nmae' is a typo, not a key
const TYPO: SettingValue<'board.nmae'> = ''

export type { SettingKey }
export { NAME, OFFLINE, PER_PAGE, MODE, KEY, UNKNOWN_KEY, WRONG_TYPE, WRONG_SHAPE, TYPO }
