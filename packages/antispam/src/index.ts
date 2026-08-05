/**
 * `@meith/antispam` — F46: keeping a board usable when somebody is trying to
 * fill it with rubbish.
 *
 * Four mechanisms, and the reason there are four is that each one is weak and
 * they fail to different attacks:
 *
 *  - **rate limits** bound how much anybody can do in a window, across every
 *    instance, because the counter is a database row rather than process state;
 *  - **a honeypot and a fill-time floor** cost a legitimate visitor nothing and
 *    catch the bots that fill every field or submit instantly;
 *  - **a captcha** asks the visitor for something, behind a seam so a board can
 *    swap in a hosted one without any call site changing;
 *  - **first-post moderation** holds a new account's opening posts, which is the
 *    cheapest control a forum has — spam accounts post once and never return.
 *
 * Everything here is pure and takes its storage as a port (R2), so the same
 * logic runs against Postgres and against a test double. What is *not* here is
 * any judgement about content: there is no scoring, no keyword list and no
 * "does this look like spam". Those are guesses, they are wrong about real
 * members, and this board already has a word filter (F71) and a moderation
 * queue (F49) for the cases a human should look at.
 */

export {
  FIXED_RATE_LIMIT_SCOPES,
  RATE_LIMIT_SCOPES,
  RateLimiter,
  isRateLimitScope,
  subjectFor,
  windowStartFor,
  type ConfiguredRateLimitScope,
  type FixedRateLimitScope,
  type RateLimitOutcome,
  type RateLimitRule,
  type RateLimitScope,
  type RateLimitStore,
} from './limits'

export {
  HONEYPOT_FIELD,
  QuestionCaptcha,
  checkHoneypot,
  noCaptcha,
  type CaptchaProvider,
  type CaptchaQuestion,
  type Challenge,
  type ChallengeVerdict,
  type HoneypotInput,
  type QuestionSource,
} from './challenge'

export {
  holdsForReview,
  type FirstPostRule,
  type FirstPostSubject,
} from './first-post'
