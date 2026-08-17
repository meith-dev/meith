import { describe, expect, it } from 'vitest'

import {
  connectorState,
  googleConnector,
  googleEndpoint,
  googlePageView,
  googleSessionId,
  isMeasurementId,
} from './google'

const READY = {
  enabled: true,
  measurementId: 'G-ABCD1234',
  apiSecret: 'a-secret',
}

describe('connectorState', () => {
  it('is off until somebody switches it on', () => {
    expect(connectorState({ ...READY, enabled: false })).toBe('off')
  })

  it('says which half is missing', () => {
    expect(connectorState({ ...READY, measurementId: '' })).toBe('missing-id')
    expect(connectorState({ ...READY, measurementId: 'UA-12345-1' })).toBe('invalid-id')
    expect(connectorState({ ...READY, apiSecret: '' })).toBe('missing-secret')
  })

  it('is ready with both', () => {
    expect(connectorState(READY)).toBe('ready')
  })
})

describe('googleConnector', () => {
  it('is null unless the connector is ready', () => {
    expect(googleConnector({ ...READY, enabled: false })).toBeNull()
    expect(googleConnector({ ...READY, apiSecret: '' })).toBeNull()
  })

  it('trims what it was given', () => {
    expect(
      googleConnector({ ...READY, measurementId: ' G-ABCD1234 ', apiSecret: ' s ' }),
    ).toEqual({ measurementId: 'G-ABCD1234', apiSecret: 's' })
  })
})

describe('isMeasurementId', () => {
  it('accepts a GA4 measurement id and nothing else', () => {
    expect(isMeasurementId('G-ABCD1234')).toBe(true)
    expect(isMeasurementId(' G-ABCD1234 ')).toBe(true)
    expect(isMeasurementId('G-abcd1234')).toBe(false)
    expect(isMeasurementId('UA-12345-1')).toBe(false)
    expect(isMeasurementId('')).toBe(false)
  })
})

describe('googleEndpoint', () => {
  it('carries the measurement id and the secret in the query', () => {
    const url = new URL(googleEndpoint({ measurementId: 'G-ABCD1234', apiSecret: 's&s' }))

    expect(url.origin).toBe('https://www.google-analytics.com')
    expect(url.pathname).toBe('/mp/collect')
    expect(url.searchParams.get('measurement_id')).toBe('G-ABCD1234')
    expect(url.searchParams.get('api_secret')).toBe('s&s')
  })
})

describe('googleSessionId', () => {
  it('holds still inside the session window and moves outside it', () => {
    const clientId = '1.2'
    const at = new Date('2026-08-17T10:00:00Z')

    expect(googleSessionId({ clientId, at })).toBe(
      googleSessionId({ clientId, at: new Date('2026-08-17T10:29:00Z') }),
    )
    expect(googleSessionId({ clientId, at })).not.toBe(
      googleSessionId({ clientId, at: new Date('2026-08-17T10:31:00Z') }),
    )
  })
})

describe('googlePageView', () => {
  it('sends one page_view and no personal detail', () => {
    const body = JSON.parse(
      googlePageView({
        clientId: '1.2',
        sessionId: '17',
        pageLocation: 'https://forum.example/12',
        pageTitle: 'Introductions',
        pageReferrer: 'https://news.example/',
      }),
    ) as Record<string, unknown>

    expect(body.client_id).toBe('1.2')
    expect(body.non_personalized_ads).toBe(true)
    expect(body.events).toEqual([
      {
        name: 'page_view',
        params: {
          page_location: 'https://forum.example/12',
          session_id: '17',
          engagement_time_msec: 1,
          page_title: 'Introductions',
          page_referrer: 'https://news.example/',
        },
      },
    ])
    expect(JSON.stringify(body)).not.toContain('user_id')
  })

  it('leaves out the title and the referrer when there are none', () => {
    const body = JSON.parse(
      googlePageView({
        clientId: '1.2',
        sessionId: '17',
        pageLocation: 'https://forum.example/',
      }),
    ) as { events: { params: Record<string, unknown> }[] }

    expect(body.events[0]?.params).not.toHaveProperty('page_title')
    expect(body.events[0]?.params).not.toHaveProperty('page_referrer')
  })
})
