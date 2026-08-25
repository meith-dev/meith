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

    const from = write ? await this.deps.promotions.scanCursor() : 0
    const batch = await this.deps.promotions.candidates(from, limit)
    const outcomes = evaluatePromotions(rules, batch, this.deps.guards, this.now())

    if (write) {
      if (outcomes.length > 0) await this.deps.promotions.applyPromotions(outcomes)

      const next = batch.length < limit ? 0 : (batch[batch.length - 1]?.userId ?? 0)
      await this.deps.promotions.advanceScanCursor(next)
    }

    return { outcomes, applied: write, examined: batch.length }
  }
}
