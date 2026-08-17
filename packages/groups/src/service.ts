import type { PromotionRepository } from './ports'
import { evaluatePromotions, type PromotionGuards, type PromotionOutcome } from './promotion'

export interface PromotionServiceDeps {
  readonly promotions: PromotionRepository
  readonly guards: PromotionGuards
  readonly clock?: () => Date
}

export interface PromotionRunResult {
  readonly outcomes: readonly PromotionOutcome[]
  readonly applied: boolean
  readonly examined: number
}

export class PromotionService {
  private readonly now: () => Date

  constructor(private readonly deps: PromotionServiceDeps) {
    this.now = deps.clock ?? (() => new Date())
  }

  async preview(limit = 500): Promise<PromotionRunResult> {
    return this.run(limit, false)
  }

  async apply(limit = 500): Promise<PromotionRunResult> {
    return this.run(limit, true)
  }

  private async run(limit: number, write: boolean): Promise<PromotionRunResult> {
    const rules = await this.deps.promotions.listRules()

    if (rules.length === 0) return { outcomes: [], applied: write, examined: 0 }

    const now = this.now()
    const outcomes: PromotionOutcome[] = []
    let examined = 0
    let afterUserId = 0

    for (;;) {
      const batch = await this.deps.promotions.candidates(afterUserId, limit)
      if (batch.length === 0) break

      examined += batch.length
      outcomes.push(...evaluatePromotions(rules, batch, this.deps.guards, now))
      afterUserId = batch[batch.length - 1]?.userId ?? afterUserId

      if (batch.length < limit) break
    }

    if (write && outcomes.length > 0) {
      await this.deps.promotions.applyPromotions(outcomes)
    }

    return { outcomes, applied: write, examined }
  }
}
