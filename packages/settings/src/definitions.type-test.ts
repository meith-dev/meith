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
export { KEY, MODE, NAME, OFFLINE, PER_PAGE, TYPO, UNKNOWN_KEY, WRONG_SHAPE, WRONG_TYPE }
