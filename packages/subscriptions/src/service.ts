import type { ThreadAudience } from '@meith/core'
import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { parseSubscriptionMode, type SubscriptionMode, type SubscriptionTarget } from './modes'
import type { SubscriptionRepository, SubscriptionRow } from './types'

export const SUBSCRIPTIONS_PAGE_SIZE = 200

export class SubscriptionService {
  private readonly repository: SubscriptionRepository
  private readonly now: () => Date

  constructor(deps: { subscriptions: SubscriptionRepository; now?: () => Date }) {
    this.repository = deps.subscriptions
    this.now = deps.now ?? (() => new Date())
  }

  async subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: string
    readonly mayView: boolean
  }): Promise<SubscriptionMode> {
    if (!input.mayView) throw new ValidationError(msg('error.subscriptions.exist'))

    const mode = parseSubscriptionMode(input.mode)
    if (mode === null) throw new ValidationError(msg('error.subscriptions.notification-setting'))

    const written = await this.repository.subscribe({
      userId: input.userId,
      target: input.target,
      targetId: input.targetId,
      mode,
      at: this.now(),
    })
    if (!written) throw new ValidationError(msg('error.subscriptions.exist'))

    return mode
  }

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

  async list(userId: number, audience: ThreadAudience): Promise<readonly SubscriptionRow[]> {
    return this.repository.listFor(userId, {
      audience,
      limit: SUBSCRIPTIONS_PAGE_SIZE,
    })
  }
}
