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

export {
  coerceFormValue,
  settingField,
  type SettingField,
  type SettingOption,
} from './fields'

export {
  MAIL_PRESETS,
  MAIL_PRESET_BY_ID,
  NO_MAIL,
  canSendMail,
  defaultPort,
  describeMailConfig,
  mailConfigFromEnvironment,
  mailConfigFromSettings,
  mailConfigProblems,
  resolveMailConfig,
  type HttpMailConfig,
  type LogMailConfig,
  type MailConfig,
  type MailEnvironment,
  type MailPreset,
  type MailResolution,
  type MailSecurity,
  type MailSource,
  type MailTransport,
  type SmtpMailConfig,
} from './mail'

export {
  isUsableOrigin,
  normaliseOrigin,
  resolveBoardUrl,
  type BoardUrlEnvironment,
  type BoardUrlResolution,
  type BoardUrlSource,
} from './board-url'
