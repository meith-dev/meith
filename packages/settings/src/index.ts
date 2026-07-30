/** F08 — typed board settings registry. */

export {
  SETTING_DEFINITIONS,
  SETTING_DEFINITION_BY_KEY,
  type SettingDefinition,
  type SettingGroup,
  type SettingKey,
  type SettingValue,
} from './definitions'

export {
  SettingsSnapshot,
  saveSettings,
  type SaveResult,
  type SettingsRepository,
  type SettingsSnapshotOptions,
} from './store'
