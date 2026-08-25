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
  readonly complete: boolean
}

export const PROMOTION_REVIEW_PAGE = 5_000

export const PROMOTION_REVIEW_CEILING = 50_000

export const PROMOTION_ADVANCE_PAGE = 1_000

export interface PromotionAdvanceOptions {
  readonly signal?: AbortSignal
  readonly page?: number
}

export class PromotionService {
  private readonly now: () => Date

  constructor(private readonly deps: PromotionServiceDeps) {
    this.now = deps.clock ?? (() => new Date())
  }

  async preview(
    page = PROMOTION_REVIEW_PAGE,
    ceiling = PROMOTION_REVIEW_CEILING,
  ): Promise<PromotionRunResult> {
    return this.review(page, ceiling, false)
  }

  async apply(
    page = PROMOTION_REVIEW_PAGE,
    ceiling = PROMOTION_REVIEW_CEILING,
  ): Promise<PromotionRunResult> {
    return this.review(page, ceiling, true)
  }

  async advance(limit: number, options: PromotionAdvanceOptions = {}): Promise<PromotionRunResult> {
    const { signal, page = PROMOTION_ADVANCE_PAGE } = options
    const rules = await this.deps.promotions.listRules()

    if (rules.length === 0) return { outcomes: [], applied: true, examined: 0, complete: true }

    const now = this.now()
    const outcomes: PromotionOutcome[] = []

    let cursor = await this.deps.promotions.scanCursor()
    let examined = 0
    let complete = false

    while (examined < limit && signal?.aborted !== true) {
      const size = Math.min(page, limit - examined)
      const batch = await this.deps.promotions.candidates(cursor, size)
      const found = evaluatePromotions(rules, batch, this.deps.guards, now)

      if (found.length > 0) await this.deps.promotions.applyPromotions(found)

      outcomes.push(...found)
      examined += batch.length

      if (batch.length < size) {
        cursor = 0
        complete = true
        break
      }

      cursor = batch[batch.length - 1]?.userId ?? cursor
    }

    await this.deps.promotions.advanceScanCursor(cursor)

    return { outcomes, applied: true, examined, complete }
  }

  private async review(page: number, ceiling: number, write: boolean): Promise<PromotionRunResult> {
    const rules = await this.deps.promotions.listRules()

    if (rules.length === 0) return { outcomes: [], applied: write, examined: 0, complete: true }

    const now = this.now()
    const outcomes: PromotionOutcome[] = []

    let afterUserId = 0
    let examined = 0
    let complete = true

    for (;;) {
      const room = ceiling - examined
      if (room <= 0) {
        complete = false
        break
      }

      const size = Math.min(page, room)
      const batch = await this.deps.promotions.candidates(afterUserId, size)

      examined += batch.length
      outcomes.push(...evaluatePromotions(rules, batch, this.deps.guards, now))
      afterUserId = batch[batch.length - 1]?.userId ?? afterUserId

      if (batch.length < size) break
    }

    if (write && outcomes.length > 0) await this.deps.promotions.applyPromotions(outcomes)

    return { outcomes, applied: write, examined, complete }
  }
}
