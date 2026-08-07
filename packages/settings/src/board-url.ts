/**
 * Where the board lives, decided in one place.
 *
 * ## Why this stopped being environment-only
 *
 * `APP_URL` was the last value on the documented self-hosting path that a human
 * had to know. Everything else in the `.env` that guide writes is generated —
 * `openssl rand` for the database password and the two secrets, a fixed literal
 * for the port — and this one variable is the reason the file cannot simply be
 * produced by a script.
 *
 * It is also the one the handbook already called "the single most likely
 * misconfiguration on a new board", and the failure is the same silent kind mail
 * had: nothing errors. Every link in every message is built from this, so a
 * board without it sends a password reset that arrives, reads politely, and
 * carries no link at all.
 *
 * So the installer asks — prefilled from the address the operator is already
 * looking at — and the environment keeps the same veto it keeps over mail.
 *
 * ## The prefill is a suggestion, never a stored value
 *
 * The installer fills this box from the request's `Host`, and that value is
 * **attacker-controlled**. A board that stored it unread would be one `Host:`
 * header away from writing an attacker's origin into every future
 * password-reset link — which is the classic host-header poisoning bug, and it
 * would be self-inflicted here rather than incidental.
 *
 * What makes it safe is that it lands in a visible, required field on a form the
 * operator submits. Prefilled, looked at, confirmed. `resolveBoardUrl` never
 * sees a request and could not do this itself, which is the point of it being
 * pure: the dangerous step is somewhere a reader can find it.
 */

import { normaliseOrigin } from './origin'
import type { SettingsSnapshot } from './store'

/** Taken as a value, like `MailEnvironment`, and for the same R2 reason. */
export interface BoardUrlEnvironment {
  readonly APP_URL?: string | undefined
}

export type BoardUrlSource =
  /** `APP_URL` is set. The settings screen must not offer to change it. */
  | 'environment'
  /** The `board.url` setting decided it. */
  | 'board'
  /** Neither. Every absolute link on this board is degraded. */
  | 'none'

export interface BoardUrlResolution {
  /** Absolute origin with no trailing slash, or empty when nothing is set. */
  readonly url: string
  readonly source: BoardUrlSource
}

/**
 * The board's own origin.
 *
 * `APP_URL` wins outright when set, on mail's precedence rule and for the same
 * reasons — an operator who configures the deployment from files gets to keep
 * doing that, and the rule is one sentence rather than a table.
 */
export function resolveBoardUrl(input: {
  readonly environment: BoardUrlEnvironment
  readonly settings: SettingsSnapshot
}): BoardUrlResolution {
  const fromEnvironment = normaliseOrigin(input.environment.APP_URL ?? '')
  if (fromEnvironment !== '')
    return { url: fromEnvironment, source: 'environment' }

  const stored = normaliseOrigin(input.settings.get('board.url'))
  return stored === ''
    ? { url: '', source: 'none' }
    : { url: stored, source: 'board' }
}

/*
 * Re-exported so callers have one place to import "everything about the board's
 * address" from. They live in `origin.ts` because `definitions.ts` needs them
 * too and cannot import this module without a cycle — see that file's header.
 */
export { isUsableOrigin, normaliseOrigin } from './origin'
