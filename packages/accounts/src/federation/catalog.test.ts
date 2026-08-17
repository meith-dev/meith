import { describe, expect, it } from 'vitest'

import {
  configuredProviders,
  isProviderKind,
  parseScopes,
  providerFor,
  providerLabel,
} from './catalog'
import type { FederationOptions } from './types'

const OFF: FederationOptions = {
  github: { enabled: false, clientId: '', clientSecret: '' },
  google: { enabled: false, clientId: '', clientSecret: '' },
  oidc: { enabled: false, clientId: '', clientSecret: '', issuer: '', label: '', scopes: '' },
}

function withGithub(overrides: Partial<FederationOptions['github']>): FederationOptions {
  return {
    ...OFF,
    github: { enabled: true, clientId: 'id', clientSecret: 'secret', ...overrides },
  }
}

describe('which providers a board offers', () => {
  it('offers none until an operator turns one on', () => {
    expect(configuredProviders(OFF)).toEqual([])
  })

  it('offers one that is switched on and fully configured', () => {
    const offered = configuredProviders(withGithub({}))
    expect(offered.map((provider) => provider.id)).toEqual(['github'])
    expect(offered[0]?.label).toBe('GitHub')
  })

  it('leaves out one that is switched on with half its credentials', () => {
    expect(configuredProviders(withGithub({ clientSecret: '' }))).toEqual([])
    expect(configuredProviders(withGithub({ clientId: '   ' }))).toEqual([])
  })

  it('leaves out one whose credentials are complete but which is switched off', () => {
    expect(configuredProviders(withGithub({ enabled: false }))).toEqual([])
  })

  it('needs an issuer that parses before it will offer the generic path', () => {
    const base = {
      ...OFF,
      oidc: {
        enabled: true,
        clientId: 'id',
        clientSecret: 'secret',
        issuer: 'not a url',
        label: '',
        scopes: '',
      },
    }

    expect(providerFor('oidc', base)).toBeNull()
    expect(
      providerFor('oidc', {
        ...base,
        oidc: { ...base.oidc, issuer: 'https://login.example.com' },
      }),
    ).not.toBeNull()
  })

  it('names the generic provider whatever the operator called it', () => {
    const options: FederationOptions = {
      ...OFF,
      oidc: {
        enabled: true,
        clientId: 'id',
        clientSecret: 'secret',
        issuer: 'https://login.example.com',
        label: '  Acme staff login  ',
        scopes: '',
      },
    }

    expect(providerFor('oidc', options)?.label).toBe('Acme staff login')
    expect(providerFor('oidc', { ...options, oidc: { ...options.oidc, label: '' } })?.label).toBe(
      'Single sign-on',
    )
  })

  it('knows which provider names exist', () => {
    expect(isProviderKind('github')).toBe(true)
    expect(isProviderKind('facebook')).toBe(false)
  })
})

describe('the scopes asked for', () => {
  it('always asks for openid, however the operator wrote the list', () => {
    expect(parseScopes('email profile')).toEqual(['openid', 'email', 'profile'])
    expect(parseScopes('openid groups')).toEqual(['openid', 'groups'])
  })

  it('falls back to a set an account can be built from when the list is empty', () => {
    expect(parseScopes('')).toEqual(['openid', 'email', 'profile'])
    expect(parseScopes('openid')).toEqual(['openid', 'email', 'profile'])
  })

  it('accepts commas, which is how half the consoles print them', () => {
    expect(parseScopes('email, profile')).toEqual(['openid', 'email', 'profile'])
  })
})

describe('what a link is called', () => {
  it('names a provider even when it has been switched off since', () => {
    expect(providerLabel('github')).toBe('GitHub')
    expect(providerLabel('google')).toBe('Google')
    expect(providerLabel('oidc')).toBe('Single sign-on')
  })

  it('says back whatever it was given when the name means nothing here', () => {
    expect(providerLabel('facebook')).toBe('facebook')
  })
})
