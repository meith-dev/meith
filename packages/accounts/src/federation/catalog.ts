import { githubProvider } from './github'
import { DEFAULT_OIDC_SCOPES, oidcProvider } from './oidc'
import type {
  FederationOptions,
  Fetcher,
  IdentityProvider,
  OidcCredentials,
  ProviderCredentials,
  ProviderKind,
} from './types'

export const PROVIDER_KINDS: readonly ProviderKind[] = ['github', 'google', 'oidc']

/**
 * What a link is called when the provider behind it is switched off: the
 * identity stays on the account, so the row still has to say something a
 * member recognises rather than the key it is stored under.
 */
const PROVIDER_LABELS: Readonly<Record<ProviderKind, string>> = {
  github: 'GitHub',
  google: 'Google',
  oidc: 'Single sign-on',
}

export function providerLabel(id: string): string {
  return isProviderKind(id) ? PROVIDER_LABELS[id] : id
}

const GOOGLE_ISSUER = 'https://accounts.google.com'

export interface ProviderBuildDeps {
  readonly fetcher?: Fetcher
  readonly clock?: () => Date
}

export function isProviderKind(value: string): value is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(value)
}

export function configuredProviders(
  options: FederationOptions,
  deps: ProviderBuildDeps = {},
): readonly IdentityProvider[] {
  return PROVIDER_KINDS.map((kind) => providerFor(kind, options, deps)).filter(
    (provider): provider is IdentityProvider => provider !== null,
  )
}

export function providerFor(
  kind: ProviderKind,
  options: FederationOptions,
  deps: ProviderBuildDeps = {},
): IdentityProvider | null {
  if (kind === 'github') {
    if (!usable(options.github)) return null
    return githubProvider({
      clientId: options.github.clientId.trim(),
      clientSecret: options.github.clientSecret,
      ...(deps.fetcher === undefined ? {} : { fetcher: deps.fetcher }),
    })
  }

  if (kind === 'google') {
    if (!usable(options.google)) return null
    return oidcProvider({
      id: 'google',
      label: 'Google',
      issuer: GOOGLE_ISSUER,
      clientId: options.google.clientId.trim(),
      clientSecret: options.google.clientSecret,
      scopes: DEFAULT_OIDC_SCOPES,
      ...(deps.fetcher === undefined ? {} : { fetcher: deps.fetcher }),
      ...(deps.clock === undefined ? {} : { clock: deps.clock }),
    })
  }

  if (!usable(options.oidc) || !usableIssuer(options.oidc)) return null

  return oidcProvider({
    id: 'oidc',
    label: options.oidc.label.trim() === '' ? 'Single sign-on' : options.oidc.label.trim(),
    issuer: options.oidc.issuer.trim(),
    clientId: options.oidc.clientId.trim(),
    clientSecret: options.oidc.clientSecret,
    scopes: parseScopes(options.oidc.scopes),
    ...(deps.fetcher === undefined ? {} : { fetcher: deps.fetcher }),
    ...(deps.clock === undefined ? {} : { clock: deps.clock }),
  })
}

export function parseScopes(raw: string): readonly string[] {
  const requested = raw.split(/[\s,]+/u).filter((scope) => scope !== '')
  const merged = ['openid', ...requested.filter((scope) => scope !== 'openid')]
  return merged.length === 1 ? [...DEFAULT_OIDC_SCOPES] : merged
}

function usable(credentials: ProviderCredentials): boolean {
  return (
    credentials.enabled &&
    credentials.clientId.trim() !== '' &&
    credentials.clientSecret.trim() !== ''
  )
}

function usableIssuer(credentials: OidcCredentials): boolean {
  const issuer = credentials.issuer.trim()
  if (issuer === '') return false

  try {
    const url = new URL(issuer)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
