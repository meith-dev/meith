import { ConfigurationError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { fetchJson, readBoolean, readString } from './http'
import { type IdTokenClaims, stringClaim, verifyIdToken } from './jwt'
import { codeChallenge } from './pkce'
import type {
  AuthorizeInput,
  ExchangeInput,
  Fetcher,
  IdentityProvider,
  ProviderKind,
  ProviderProfile,
} from './types'

export interface OidcProviderConfig {
  readonly id: ProviderKind
  readonly label: string
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly scopes: readonly string[]
  readonly fetcher?: Fetcher
  readonly clock?: () => Date
}

interface Discovery {
  readonly issuer: string
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
  readonly userinfoEndpoint: string | null
}

export const DEFAULT_OIDC_SCOPES = ['openid', 'email', 'profile'] as const

export function oidcProvider(config: OidcProviderConfig): IdentityProvider {
  const fetcher = config.fetcher ?? fetch
  const clock = config.clock ?? (() => new Date())
  const issuer = config.issuer.replace(/\/$/, '')

  return {
    id: config.id,
    label: config.label,

    async authorizationUrl(input: AuthorizeInput): Promise<string> {
      const discovery = await discover(fetcher, issuer)
      const url = new URL(discovery.authorizationEndpoint)

      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('scope', config.scopes.join(' '))
      url.searchParams.set('state', input.state)
      url.searchParams.set('nonce', input.nonce)
      url.searchParams.set('code_challenge', await codeChallenge(input.codeVerifier))
      url.searchParams.set('code_challenge_method', 'S256')

      return url.toString()
    },

    async exchange(input: ExchangeInput): Promise<ProviderProfile> {
      const discovery = await discover(fetcher, issuer)

      const token = await fetchJson(
        fetcher,
        discovery.tokenEndpoint,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: input.code,
            redirect_uri: input.redirectUri,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code_verifier: input.codeVerifier,
          }).toString(),
        },
        'exchange the sign-in code',
      )

      const idToken = readString(token, 'id_token')
      if (idToken === null) {
        throw new ValidationError(msg('error.accounts.identity-provider-answered-code-exchange'))
      }

      const claims = await verifyIdToken({
        token: idToken,
        issuer: discovery.issuer,
        audience: config.clientId,
        nonce: input.nonce,
        jwksUri: discovery.jwksUri,
        fetcher,
        now: clock(),
      })

      const accessToken = readString(token, 'access_token')
      const userinfo =
        discovery.userinfoEndpoint === null || accessToken === null
          ? {}
          : await userInfo(fetcher, discovery.userinfoEndpoint, accessToken)

      return profileFrom(claims, userinfo)
    },
  }
}

async function userInfo(
  fetcher: Fetcher,
  endpoint: string,
  accessToken: string,
): Promise<IdTokenClaims> {
  try {
    const body = await fetchJson(
      fetcher,
      endpoint,
      { headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` } },
      'read the account profile',
    )
    return typeof body === 'object' && body !== null ? (body as IdTokenClaims) : {}
  } catch {
    return {}
  }
}

function profileFrom(claims: IdTokenClaims, userinfo: IdTokenClaims): ProviderProfile {
  const merged: IdTokenClaims = { ...userinfo, ...claims }

  const subject = stringClaim(merged, 'sub')
  if (subject === null) {
    throw new ValidationError(msg('error.accounts.identity-provider-sent-account-with'))
  }

  const emailFromToken = stringClaim(claims, 'email')
  const emailSource = emailFromToken !== null ? claims : userinfo
  const email = emailFromToken ?? stringClaim(userinfo, 'email')

  return {
    subject,
    email,
    emailVerified: email !== null && readBoolean(emailSource, 'email_verified'),
    username:
      stringClaim(merged, 'preferred_username') ??
      stringClaim(merged, 'nickname') ??
      stringClaim(userinfo, 'preferred_username'),
    displayName: stringClaim(merged, 'name') ?? stringClaim(userinfo, 'name'),
  }
}

async function discover(fetcher: Fetcher, issuer: string): Promise<Discovery> {
  const document = await fetchJson(
    fetcher,
    `${issuer}/.well-known/openid-configuration`,
    { headers: { accept: 'application/json' } },
    'read its OpenID configuration',
  )

  const authorizationEndpoint = readString(document, 'authorization_endpoint')
  const tokenEndpoint = readString(document, 'token_endpoint')
  const jwksUri = readString(document, 'jwks_uri')

  if (authorizationEndpoint === null || tokenEndpoint === null || jwksUri === null) {
    throw new ConfigurationError(
      `The OpenID configuration at ${issuer} is missing an endpoint this board needs.`,
    )
  }

  return {
    issuer: readString(document, 'issuer') ?? issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint: readString(document, 'userinfo_endpoint'),
  }
}
