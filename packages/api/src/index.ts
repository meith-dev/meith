/**
 * `@forum/api` — the public REST API's domain half (F81).
 *
 * Tokens, scopes, the route registry, the rate-limit arithmetic, and webhook
 * signing and retry. No Next, no SQL, no `Response`: the app layer owns the
 * HTTP, this package owns the decisions — which is what lets every one of them
 * be tested without a server and reused by the worker that delivers webhooks.
 */

export {
  SCOPES,
  TOKEN_PREFIX,
  authenticateToken,
  bearerFrom,
  hasScope,
  hashTokenSecret,
  isScope,
  issueToken,
  parseToken,
  type ApiTokenRecord,
  type ApiTokenRepository,
  type IssuedToken,
  type ParsedToken,
  type Scope,
  type TokenFailure,
  type TokenOutcome,
} from './tokens'

export {
  ROUTES,
  idParam,
  matchRoute,
  routeKey,
  type Method,
  type RouteKey,
  type RouteSpec,
} from './routes'

export {
  DEFAULT_WINDOW,
  consumeRateLimit,
  rateLimitHeaders,
  windowStart,
  type RateLimitOutcome,
  type RateLimitStore,
  type RateLimitWindow,
} from './rate-limit'

export {
  DELIVERY_HEADER,
  EVENT_HEADER,
  MAX_ATTEMPTS,
  REPLAY_TOLERANCE_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_TOPICS,
  deliveryHeaders,
  isWebhookTopic,
  nextRetryDelaySeconds,
  signPayload,
  verdictFor,
  verifySignature,
  type DeliveryVerdict,
  type WebhookDelivery,
  type WebhookSubscription,
  type WebhookTopic,
} from './webhooks'
