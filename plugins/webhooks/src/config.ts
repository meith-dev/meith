export type WebhookFormat = 'discord' | 'json'

export interface WebhooksConfig {
  readonly endpointUrl: string
  readonly format: WebhookFormat
  readonly signingSecret: string
  readonly sendPosts: boolean
  readonly boardUrl: string
}

export const FORMATS: readonly WebhookFormat[] = ['discord', 'json']

export const EVENT_CHOICES = ['threads', 'threads-and-posts'] as const

function text(settings: Readonly<Record<string, string | number | boolean>>, key: string): string {
  const value = settings[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveWebhooksConfig(
  settings: Readonly<Record<string, string | number | boolean>>,
): WebhooksConfig {
  const format = text(settings, 'format')

  return {
    endpointUrl: text(settings, 'endpoint_url'),
    format: FORMATS.includes(format as WebhookFormat) ? (format as WebhookFormat) : 'discord',
    signingSecret: text(settings, 'signing_secret'),
    sendPosts: text(settings, 'events') === 'threads-and-posts',
    boardUrl: text(settings, 'board_url').replace(/\/+$/, ''),
  }
}

export function endpointProblem(config: WebhooksConfig): 'missing' | 'insecure' | null {
  if (config.endpointUrl === '') return 'missing'

  let parsed: URL
  try {
    parsed = new URL(config.endpointUrl)
  } catch {
    return 'insecure'
  }

  return parsed.protocol === 'https:' ? null : 'insecure'
}

export function isDeliverable(config: WebhooksConfig): boolean {
  return endpointProblem(config) === null
}
