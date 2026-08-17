import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { fetchJson, readBoolean, readString } from './http'
import type {
  AuthorizeInput,
  ExchangeInput,
  Fetcher,
  IdentityProvider,
  ProviderProfile,
} from './types'

const AUTHORIZE = 'https://github.com/login/oauth/authorize'
const TOKEN = 'https://github.com/login/oauth/access_token'
const USER = 'https://api.github.com/user'
const EMAILS = 'https://api.github.com/user/emails'

const SCOPES = 'read:user user:email'

export interface GithubProviderConfig {
  readonly clientId: string
  readonly clientSecret: string
  readonly label?: string
  readonly fetcher?: Fetcher
}

export function githubProvider(config: GithubProviderConfig): IdentityProvider {
  const fetcher = config.fetcher ?? fetch

  return {
    id: 'github',
    label: config.label ?? 'GitHub',

    async authorizationUrl(input: AuthorizeInput): Promise<string> {
      const url = new URL(AUTHORIZE)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('scope', SCOPES)
      url.searchParams.set('state', input.state)
      url.searchParams.set('allow_signup', 'false')
      return url.toString()
    },

    async exchange(input: ExchangeInput): Promise<ProviderProfile> {
      const token = await fetchJson(
        fetcher,
        TOKEN,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: input.code,
            redirect_uri: input.redirectUri,
          }).toString(),
        },
        'exchange the sign-in code',
      )

      const accessToken = readString(token, 'access_token')
      if (accessToken === null) {
        throw new ValidationError(msg('error.accounts.github-refused-sign-in-code-start'))
      }

      const headers = {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'x-github-api-version': '2022-11-28',
      }

      const account = await fetchJson(fetcher, USER, { headers }, 'read the account profile')

      const subject = readString(account, 'id')
      if (subject === null) {
        throw new ValidationError(msg('error.accounts.github-sent-account-with-stable'))
      }

      const verified = await verifiedEmail(fetcher, headers)

      return {
        subject,
        email: verified?.email ?? readString(account, 'email'),
        emailVerified: verified !== null,
        username: readString(account, 'login'),
        displayName: readString(account, 'name'),
      }
    },
  }
}

async function verifiedEmail(
  fetcher: Fetcher,
  headers: Record<string, string>,
): Promise<{ email: string } | null> {
  let body: unknown
  try {
    body = await fetchJson(fetcher, EMAILS, { headers }, 'read the account addresses')
  } catch {
    return null
  }

  if (!Array.isArray(body)) return null

  const usable = body.filter(
    (entry) => readBoolean(entry, 'verified') && readString(entry, 'email') !== null,
  )

  const chosen = usable.find((entry) => readBoolean(entry, 'primary')) ?? usable[0]
  if (chosen === undefined) return null

  const email = readString(chosen, 'email')
  return email === null ? null : { email }
}
