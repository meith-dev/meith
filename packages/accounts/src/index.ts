export {
  CURRENT_PASSWORD_POLICY,
  hashPassword,
  verifyPassword,
  needsRehash,
  parseArgon2Params,
  type PasswordPolicy,
  type Argon2Params,
} from './crypto/password'

export {
  generateToken,
  hashToken,
  timingSafeEqual,
} from './crypto/tokens'

export {
  IdentityService,
  VERIFICATION_TTL_HOURS,
  type ActivationOutcome,
  type BanLookup,
  type IdentityDeps,
  type RegisterInput,
  type RegisterResult,
  type RequestContext,
  type LoginResult,
  type ResendVerification,
  type ResetRequest,
} from './service'

export {
  SessionService,
  type SessionServiceDeps,
  type RememberedLogin,
  type ResumeOutcome,
} from './session-service'

export {
  REGISTER_FIELD,
  rejectedField,
  type RegisterField,
} from './register-fields'

export { createMemoryStore } from './memory-repos'

export { foldIdentifier } from './case-fold'

export {
  AUTH_SETTING_KEYS,
  DEFAULT_AUTH_POLICY,
  resolveAuthPolicy,
  type AuthPolicy,
  type ResolvedAuthSettings,
  type SettingReader,
} from './policy'

export {
  BAN_FILTER_TYPES,
  assertUsableFilter,
  matchBanFilter,
  type BanFilter,
  type BanFilterSubject,
  type BanFilterType,
} from './ban-filter'

export { BanService, type BanInput, type BanServiceDeps } from './ban-service'

export { MemoryBanFilters, MemoryBans } from './memory-bans'

export {
  MemberSettingsService,
  isKnownTimezone,
  isTimezonePreference,
  AUTOMATIC_TIMEZONE,
  BIO_MAX,
  EMAIL_CHANGE_TTL_MINUTES,
  LOCATION_MAX,
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  WEBSITE_MAX,
  type MemberGroupChoice,
  type MemberSettings,
  type MemberSettingsRepository,
} from './member-settings'

export type {
  BanRecord,
  BanRepository,
  BanFilterRepository,
  CreateBanInput,
  AccountRecord,
  MemberProfileRecord,
  MemberProfileRepository,
  AccountState,
  AccountStore,
  AccountRepository,
  SessionRepository,
  SessionRecord,
  SessionLocation,
  RememberTokenRepository,
  RememberRotation,
  CredentialTokenRepository,
  CredentialPurpose,
  LoginAttemptRepository,
  LoginBucket,
  AuthConfig,
  Clock,
  NewAccount,
} from './ports'

export {
  MYBB_PREFIX,
  isLegacyHash,
  parseMybbHash,
  verifyMybbPassword,
  type LegacyMybbHash,
} from './crypto/legacy'
