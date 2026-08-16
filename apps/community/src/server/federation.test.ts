import { describe, expect, it } from 'vitest'

import { configuredProviders } from '@meith/accounts'
import { SettingsSnapshot } from '@meith/settings'

import { callbackPath, federationOptions } from './federation'

function snapshot(overrides: Record<string, string> = {}): SettingsSnapshot {
  return SettingsSnapshot.fromOverrides(new Map(Object.entries(overrides)))
}

describe('what the board settings say about federated sign-in', () => {
  it('is off out of the box, with no provider offered', () => {
    const options = federationOptions(snapshot())

    expect(options.github.enabled).toBe(false)
    expect(options.google.enabled).toBe(false)
    expect(options.oidc.enabled).toBe(false)
    expect(configuredProviders(options)).toEqual([])
  })

  it('stays off when credentials are filled in but the switch is not thrown', () => {
    const options = federationOptions(
      snapshot({
        'federation.github_client_id': 'id',
        'federation.github_client_secret': 'secret',
      }),
    )

    expect(configuredProviders(options)).toEqual([])
  })

  it('offers a provider once it is switched on and complete', () => {
    const options = federationOptions(
      snapshot({
        'federation.github_enabled': '1',
        'federation.github_client_id': 'id',
        'federation.github_client_secret': 'secret',
      }),
    )

    expect(configuredProviders(options).map((provider) => provider.id)).toEqual(['github'])
  })

  it('carries the operator’s own issuer, label and scopes through', () => {
    const options = federationOptions(
      snapshot({
        'federation.oidc_enabled': '1',
        'federation.oidc_issuer': 'https://login.acme.example/realms/staff',
        'federation.oidc_label': 'Acme staff',
        'federation.oidc_client_id': 'board',
        'federation.oidc_client_secret': 'secret',
        'federation.oidc_scopes': 'openid email',
      }),
    )

    expect(options.oidc.issuer).toBe('https://login.acme.example/realms/staff')
    expect(configuredProviders(options)[0]?.label).toBe('Acme staff')
  })

  it('asks for the scopes an account can be built from by default', () => {
    expect(federationOptions(snapshot()).oidc.scopes).toBe('openid email profile')
  })
})

describe('where a provider sends the member back to', () => {
  it('is a path under the board, one per provider', () => {
    expect(callbackPath('github')).toBe('/auth/sso/github/callback')
    expect(callbackPath('google')).toBe('/auth/sso/google/callback')
    expect(callbackPath('oidc')).toBe('/auth/sso/oidc/callback')
  })
})
