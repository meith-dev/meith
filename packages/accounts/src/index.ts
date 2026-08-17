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
  REGISTRATION_CLOSED,
  SECOND_FACTOR_TTL_MINUTES,
  VERIFICATION_TTL_HOURS,
  type ActivationOutcome,
  type BanLookup,
  type FederatedProvision,
  type IdentityDeps,
  type LoginOutcome,
  type PendingSecondFactor,
  type SecondFactorLookup,
  type RegisterInput,
  type RegisterResult,
  type RequestContext,
  type LoginResult,
  type ResendVerification,
  type ResetRequest,
} from './service'

export {
  encodeBase64Url,
  decodeBase64Url,
  decodeBase64UrlText,
  randomBase64Url,
} from './crypto/base64url'

export {
  FederationService,
  UNLINK_LAST_CREDENTIAL,
  type CompleteSignInInput,
  type FederationDeps,
  type FederationOutcome,
} from './federation/service'

export {
  PROVIDER_KINDS,
  configuredProviders,
  isProviderKind,
  parseScopes,
  providerFor,
  providerLabel,
  type ProviderBuildDeps,
} from './federation/catalog'

export { githubProvider, type GithubProviderConfig } from './federation/github'

export {
  DEFAULT_OIDC_SCOPES,
  oidcProvider,
  type OidcProviderConfig,
} from './federation/oidc'

export { codeChallenge, newHandshake, type HandshakeSecrets } from './federation/pkce'

export type {
  AuthorizeInput,
  ExchangeInput,
  FederationOptions,
  IdentityProvider,
  OidcCredentials,
  ProviderCredentials,
  ProviderKind,
  ProviderProfile,
} from './federation/types'

export {
  CHALLENGE_BYTES,
  PASSKEY_LABEL_MAX,
  PASSKEY_LIMIT,
  PasskeyService,
  REMOVE_LAST_CREDENTIAL,
  newChallenge,
  passkeyLabel,
  type PasskeyAssertionOptions,
  type PasskeyDeps,
  type PasskeyRegistrationOptions,
} from './webauthn/service'

export {
  RECOVERY_CODE_COUNT,
  REPLAYED_CODE,
  TwoFactorService,
  WRONG_CODE,
  enrolmentLookup,
  newRecoveryCode,
  normaliseRecoveryCode,
  type Enrolment,
  type SecondFactorOutcome,
  type TwoFactorDeps,
  type TwoFactorState,
} from './totp/service'

export {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
  stepAt,
  totpCode,
} from './totp/totp'

export { assertSealingKey, openSecret, sealSecret } from './totp/secret-box'

export { decodeBase32, encodeBase32, isBase32 } from './totp/base32'

export {
  verifyAssertion,
  verifyRegistration,
  type AssertionResponse,
  type RegisteredCredential,
  type RegistrationResponse,
  type RelyingParty,
} from './webauthn/verify'

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

export { AUTH_EVENT_KINDS } from './ports'

export type {
  ActiveSessionRecord,
  AuthEventKind,
  AuthEventRecord,
  AuthEventRepository,
  NewAuthEvent,
  RecoveryCodeRepository,
  TwoFactorRecord,
  TwoFactorRepository,
  BanRecord,
  BanRepository,
  BanFilterRepository,
  CreateBanInput,
  LinkIdentityInput,
  NewPasskey,
  PasskeyRecord,
  PasskeyRepository,
  UserIdentityRecord,
  UserIdentityRepository,
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
