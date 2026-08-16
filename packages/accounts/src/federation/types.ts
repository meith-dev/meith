export type ProviderKind = 'github' | 'google' | 'oidc'

export interface ProviderProfile {
  readonly subject: string
  readonly email: string | null
  readonly emailVerified: boolean
  readonly username: string | null
  readonly displayName: string | null
}

export interface AuthorizeInput {
  readonly redirectUri: string
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
}

export interface ExchangeInput {
  readonly code: string
  readonly redirectUri: string
  readonly nonce: string
  readonly codeVerifier: string
}

export interface IdentityProvider {
  readonly id: ProviderKind
  readonly label: string
  authorizationUrl(input: AuthorizeInput): Promise<string>
  exchange(input: ExchangeInput): Promise<ProviderProfile>
}

export type Fetcher = typeof fetch

export interface ProviderCredentials {
  readonly enabled: boolean
  readonly clientId: string
  readonly clientSecret: string
}

export interface OidcCredentials extends ProviderCredentials {
  readonly issuer: string
  readonly label: string
  readonly scopes: string
}

export interface FederationOptions {
  readonly github: ProviderCredentials
  readonly google: ProviderCredentials
  readonly oidc: OidcCredentials
}
