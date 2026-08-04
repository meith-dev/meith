/**
 * F56 — subscribing, unsubscribing, and changing how often.
 *
 * A small service, because the interesting decisions are one layer down (the
 * watermark) and one layer up (the notifier). What it owns is the rules a
 * caller must not be able to skip: the mode is validated against the registry
 * rather than trusted from a form, "already subscribed" is not an error, and
 * every verb is scoped to the member performing it.
 */
import { ValidationError } from '@meith/core'

import {
  parseSubscriptionMode,
  type SubscriptionMode,
  type SubscriptionTarget,
} from './modes'
import type { SubscriptionRepository, SubscriptionRow } from './types'

/** The management screen shows everything; a member cannot follow thousands. */
export const SUBSCRIPTIONS_PAGE_SIZE = 200

export class SubscriptionService {
  private readonly repository: SubscriptionRepository
  private readonly now: () => Date

  constructor(deps: { subscriptions: SubscriptionRepository; now?: () => Date }) {
    this.repository = deps.subscriptions
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * Follow something, or change the cadence of something already followed.
   *
   * One verb for both, because they are the same act from the member's side —
   * and because a separate `changeMode` would be a second place that has to
   * remember not to reset the watermark. `mayView` is the caller's
   * already-resolved answer: group reasoning does not leave
   * `@meith/authorization` (R4), and the repository is handed a decision rather
   * than making one.
   */
  async subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: string
    readonly mayView: boolean
  }): Promise<SubscriptionMode> {
    /*
     * The same answer for "you cannot see this" and "this does not exist". A
     * subscribe endpoint that distinguished them is an existence oracle over
     * every private forum on the board — the trap F51's merge box named.
     */
    if (!input.mayView) throw new ValidationError('That does not exist.')

    const mode = parseSubscriptionMode(input.mode)
    if (mode === null) throw new ValidationError('That is not a notification setting.')

    const written = await this.repository.subscribe({
      userId: input.userId,
      target: input.target,
      targetId: input.targetId,
      mode,
      at: this.now(),
    })
    if (!written) throw new ValidationError('That does not exist.')

    return mode
  }

  /**
   * Stop following.
   *
   * Returns whether anything was removed, and the *caller* decides what to say
   * about it. Both answers are fine to show a member about their own
   * subscription — unlike the subscribe path, there is nothing to learn here:
   * you either were following it or you were not, and you already knew.
   */
  async unsubscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
  }): Promise<boolean> {
    return this.repository.unsubscribe(input)
  }

  async modeFor(
    userId: number,
    target: SubscriptionTarget,
    targetId: number,
  ): Promise<SubscriptionMode | null> {
    return this.repository.modeFor(userId, target, targetId)
  }

  /**
   * Everything one member follows.
   *
   * `visibleForumIds` is required rather than optional: a subscription to a
   * forum that has since been made private must not render its title back at
   * somebody who can no longer read it, and an optional argument is a default
   * somebody will eventually take.
   */
  async list(
    userId: number,
    visibleForumIds: readonly number[],
  ): Promise<readonly SubscriptionRow[]> {
    return this.repository.listFor(userId, {
      visibleForumIds,
      limit: SUBSCRIPTIONS_PAGE_SIZE,
    })
  }
}
