import 'server-only'

import { headers } from 'next/headers'

import {
  FederationService,
  PasskeyService,
  configuredProviders,
  isProviderKind,
  providerFor,
  type FederationOptions,
  type IdentityProvider,
  type ProviderKind,
  type RelyingParty,
} from '@meith/accounts'
import { env } from '@meith/core'
import type { SettingsSnapshot } from '@meith/settings'

import { boardUrl } from './board-url'
import { configuredIdentity, getContainer } from './container'
import { getSettings, getSettingsUncached } from './settings'

export const SSO_CALLBACK_PREFIX = '/auth/sso'

export interface ProviderButton {
  readonly id: ProviderKind
  readonly label: string
}

export function federationOptions(settings: SettingsSnapshot): FederationOptions {
  return {
    github: {
      enabled: settings.get('federation.github_enabled'),
      clientId: settings.get('federation.github_client_id'),
      clientSecret: settings.get('federation.github_client_secret'),
    },
    google: {
      enabled: settings.get('federation.google_enabled'),
      clientId: settings.get('federation.google_client_id'),
      clientSecret: settings.get('federation.google_client_secret'),
    },
    oidc: {
      enabled: settings.get('federation.oidc_enabled'),
      clientId: settings.get('federation.oidc_client_id'),
      clientSecret: settings.get('federation.oidc_client_secret'),
      issuer: settings.get('federation.oidc_issuer'),
      label: settings.get('federation.oidc_label'),
      scopes: settings.get('federation.oidc_scopes'),
    },
  }
}

/**
 * Every read here goes past the settings cache, because every one of them
 * decides whether a sign-in may start rather than what a page displays. The
 * cached snapshot is held per module instance, so a route handler can be a
 * minute behind the render that invalidated it — long enough for a provider an
 * operator has just switched on to answer that it is switched off.
 */
export async function federationProvider(id: string): Promise<IdentityProvider | null> {
  if (!isProviderKind(id)) return null
  if (getContainer().dataSource !== 'postgres') return null

  return providerFor(id, federationOptions(await getSettingsUncached()))
}

export async function signInProviders(): Promise<readonly ProviderButton[]> {
  if (getContainer().dataSource !== 'postgres') return []

  return configuredProviders(federationOptions(await getSettingsUncached())).map(
    (provider) => ({ id: provider.id, label: provider.label }),
  )
}

export async function passkeysEnabled(): Promise<boolean> {
  if (getContainer().dataSource !== 'postgres') return false
  return (await getSettingsUncached()).get('federation.passkeys_enabled')
}

export async function memberManagedSignIns(): Promise<boolean> {
  return (await getSettingsUncached()).get('federation.link_from_usercp')
}

export async function federationService(): Promise<FederationService> {
  const { accountStore } = getContainer()

  return new FederationService({
    identity: await configuredIdentity(),
    accounts: accountStore.accounts,
    identities: accountStore.identities,
  })
}

export async function passkeyService(): Promise<PasskeyService> {
  const { accountStore } = getContainer()

  return new PasskeyService({
    identity: await configuredIdentity(),
    accounts: accountStore.accounts,
    passkeys: accountStore.passkeys,
    identities: accountStore.identities,
  })
}

export function callbackPath(provider: ProviderKind): string {
  return `${SSO_CALLBACK_PREFIX}/${provider}/callback`
}

export async function callbackUrl(provider: ProviderKind): Promise<string> {
  return new URL(callbackPath(provider), await requestOrigin()).toString()
}

export async function relyingParty(): Promise<RelyingParty> {
  const origin = await requestOrigin()
  return { id: new URL(origin).hostname, origin }
}

export async function passkeyRelyingPartyName(): Promise<string> {
  const name = (await getSettings()).get('board.name')
  return name.trim() === '' ? 'this board' : name
}

async function requestOrigin(): Promise<string> {
  const configured = await boardUrl()
  if (configured !== '') return configured

  const incoming = await headers()
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host')
  if (host === null || host.trim() === '') {
    throw new Error('the board has no address to send an identity provider back to')
  }

  const scheme =
    incoming.get('x-forwarded-proto') ??
    (env.NODE_ENV === 'development' ? 'http' : 'https')

  return `${scheme.split(',')[0]!.trim()}://${host.trim()}`
}
