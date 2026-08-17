import 'server-only'

import { cookies, headers } from 'next/headers'
import { after } from 'next/server'

import {
  TOP_LIST_SIZE,
  connectorClientId,
  connectorState,
  countablePath,
  dayKey,
  googleConnector,
  googleEndpoint,
  googlePageView,
  googleSessionId,
  shiftDay,
  viewSource,
  visitorIdentity,
  visitorKey,
  type AnalyticsSummary,
  type ConnectorState,
  type GoogleConnector,
  type RangeChoice,
  type VisitorIdentity,
} from '@meith/analytics'
import { env, logger } from '@meith/core'
import { PostgresAnalyticsRepository, getDb } from '@meith/db'

import { boardUrl } from './board-url'
import { getContainer } from './container'
import { guestCookieName } from './cookies'
import { FRESH_GUEST_HEADER, PATH_HEADER } from './location-header'
import { getSettings } from './settings'

const GOOGLE_TIMEOUT_MS = 3_000

export interface AnalyticsState {
  readonly counting: boolean
  readonly retentionDays: number
  readonly connector: ConnectorState
  readonly knowsOwnAddress: boolean
}

export function analyticsRepository(): PostgresAnalyticsRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresAnalyticsRepository(getDb())
    : null
}

export async function analyticsState(): Promise<AnalyticsState> {
  const [settings, address] = await Promise.all([getSettings(), boardUrl()])

  return {
    counting: settings.get('analytics.enabled'),
    retentionDays: settings.get('analytics.retention_days'),
    connector: connectorState({
      enabled: settings.get('analytics.google_enabled'),
      measurementId: settings.get('analytics.google_measurement_id'),
      apiSecret: settings.get('analytics.google_api_secret'),
    }),
    knowsOwnAddress: address !== '',
  }
}

export async function recordPageView(userId: number | null): Promise<void> {
  try {
    const settings = await getSettings()
    const counting = settings.get('analytics.enabled')
    const connector = googleConnector({
      enabled: settings.get('analytics.google_enabled'),
      measurementId: settings.get('analytics.google_measurement_id'),
      apiSecret: settings.get('analytics.google_api_secret'),
    })

    if (!counting && connector === null) return

    const jar = await headers()
    const requested = jar.get(PATH_HEADER)
    if (requested === null) return

    const path = countablePath(requested)
    if (path === null) return

    const reader = await readerIdentity(userId)
    if (reader === null) return

    const now = new Date()
    const address = await boardUrl()
    const source = viewSource({
      referrer: jar.get('referer'),
      boardHost: hostOf(address),
    })

    if (counting) {
      const day = dayKey(now)
      await analyticsRepository()?.record({
        day,
        path,
        source,
        visitor: visitorKey({ subject: reader.subject, day, salt: analyticsSalt() }),
        member: reader.member,
        now,
      })
    }

    if (connector !== null && address !== '') {
      mirrorToGoogle({
        connector,
        reader,
        location: `${address}${requested}`,
        referrer: jar.get('referer'),
        now,
      })
    }
  } catch {
    /* ignore */
  }
}

export interface AnalyticsReading {
  readonly summary: AnalyticsSummary
  readonly state: AnalyticsState
}

export async function readAnalytics(days: RangeChoice): Promise<AnalyticsReading | null> {
  const repo = analyticsRepository()
  if (repo === null) return null

  const to = dayKey(new Date())

  try {
    const [summary, state] = await Promise.all([
      repo.summarise({
        from: shiftDay(to, -(days - 1)),
        to,
        topPages: TOP_LIST_SIZE,
        topSources: TOP_LIST_SIZE,
      }),
      analyticsState(),
    ])

    return { summary, state }
  } catch {
    return null
  }
}

function analyticsSalt(): string {
  return env.AUTH_SECRET ?? ''
}

function hostOf(address: string): string | null {
  try {
    return new URL(address).hostname
  } catch {
    return null
  }
}

async function readerIdentity(userId: number | null): Promise<VisitorIdentity | null> {
  if (userId !== null) return visitorIdentity({ userId, guestToken: null })

  const jar = await headers()
  if (jar.get(FRESH_GUEST_HEADER) === '1') return null

  const secure = env.NODE_ENV !== 'development'
  const token = (await cookies()).get(guestCookieName(secure))?.value ?? null

  return visitorIdentity({ userId: null, guestToken: token })
}

function mirrorToGoogle(input: {
  readonly connector: GoogleConnector
  readonly reader: VisitorIdentity
  readonly location: string
  readonly referrer: string | null
  readonly now: Date
}): void {
  const clientId = connectorClientId({
    subject: input.reader.subject,
    salt: analyticsSalt(),
  })

  const body = googlePageView({
    clientId,
    sessionId: googleSessionId({ clientId, at: input.now }),
    pageLocation: input.location,
    ...(input.referrer === null || input.referrer === ''
      ? {}
      : { pageReferrer: input.referrer }),
  })

  after(async () => {
    const log = logger({ module: 'analytics' })

    try {
      const response = await fetch(googleEndpoint(input.connector), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        cache: 'no-store',
      })

      if (!response.ok) {
        log.warn({ status: response.status }, 'the Google Analytics connector was refused')
      }
    } catch (err: unknown) {
      log.warn({ err }, 'the Google Analytics connector could not be reached')
    }
  })
}
