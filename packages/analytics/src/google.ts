export const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

export const GOOGLE_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

export const SESSION_WINDOW_MINUTES = 30

export type ConnectorState =
  | 'off'
  | 'missing-id'
  | 'invalid-id'
  | 'missing-secret'
  | 'ready'

export interface GoogleConnector {
  readonly measurementId: string
  readonly apiSecret: string
}

export function isMeasurementId(value: string): boolean {
  return MEASUREMENT_ID_PATTERN.test(value.trim())
}

export function connectorState(input: {
  readonly enabled: boolean
  readonly measurementId: string
  readonly apiSecret: string
}): ConnectorState {
  if (!input.enabled) return 'off'

  const id = input.measurementId.trim()
  if (id === '') return 'missing-id'
  if (!isMeasurementId(id)) return 'invalid-id'
  if (input.apiSecret.trim() === '') return 'missing-secret'

  return 'ready'
}

export function googleConnector(input: {
  readonly enabled: boolean
  readonly measurementId: string
  readonly apiSecret: string
}): GoogleConnector | null {
  if (connectorState(input) !== 'ready') return null

  return {
    measurementId: input.measurementId.trim(),
    apiSecret: input.apiSecret.trim(),
  }
}

export function googleEndpoint(connector: GoogleConnector): string {
  const url = new URL(GOOGLE_ENDPOINT)
  url.searchParams.set('measurement_id', connector.measurementId)
  url.searchParams.set('api_secret', connector.apiSecret)
  return url.toString()
}

export function googleSessionId(input: {
  readonly clientId: string
  readonly at: Date
}): string {
  const window = SESSION_WINDOW_MINUTES * 60_000
  return String(Math.floor(input.at.getTime() / window) * (window / 1000))
}

export function googlePageView(input: {
  readonly clientId: string
  readonly sessionId: string
  readonly pageLocation: string
  readonly pageTitle?: string | undefined
  readonly pageReferrer?: string | undefined
}): string {
  return JSON.stringify({
    client_id: input.clientId,
    non_personalized_ads: true,
    events: [
      {
        name: 'page_view',
        params: {
          page_location: input.pageLocation,
          session_id: input.sessionId,
          engagement_time_msec: 1,
          ...(input.pageTitle === undefined ? {} : { page_title: input.pageTitle }),
          ...(input.pageReferrer === undefined
            ? {}
            : { page_referrer: input.pageReferrer }),
        },
      },
    ],
  })
}
