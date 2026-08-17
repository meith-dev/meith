import { asc, eq, gt, sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type {
  PromotionCandidate,
  PromotionOutcome,
  PromotionRepository,
  PromotionRule,
  PromotionRuleInput,
  PromotionRuleRepository,
} from '@meith/groups'
import { promotionRuleProblem } from '@meith/groups'

import type { Database } from './client'
import { groupPromotions, users } from './schema'
import { keptDisplayGroupSql } from './staff-groups'

function optionalNumber(value: number | null): number | undefined {
  return value === null ? undefined : value
}

function checked(input: PromotionRuleInput): PromotionRuleInput {
  const problem = promotionRuleProblem(input)
  if (problem !== null) throw new ValidationError(problem)
  return { ...input, title: input.title.trim() }
}

export class PostgresPromotionRepository implements PromotionRepository, PromotionRuleRepository {
  constructor(private readonly db: Database) {}

  async listRules(): Promise<readonly PromotionRule[]> {
    const rows = await this.db
      .select()
      .from(groupPromotions)
      .orderBy(asc(groupPromotions.displayOrder), asc(groupPromotions.id))

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      enabled: r.enabled,
      displayOrder: r.displayOrder,
      minPostCount: optionalNumber(r.minPostCount),
      minReputation: optionalNumber(r.minReputation),
      minDaysRegistered: optionalNumber(r.minDaysRegistered),
      fromPrimaryGroupId: r.fromPrimaryGroupId,
      toPrimaryGroupId: r.toPrimaryGroupId,
    }))
  }

  async createRule(input: PromotionRuleInput): Promise<number> {
    const rule = checked(input)

    const [row] = await this.db
      .insert(groupPromotions)
      .values({
        title: rule.title,
        displayOrder: rule.displayOrder,
        minPostCount: rule.minPostCount,
        minReputation: rule.minReputation,
        minDaysRegistered: rule.minDaysRegistered,
        fromPrimaryGroupId: rule.fromPrimaryGroupId,
        toPrimaryGroupId: rule.toPrimaryGroupId,
      })
      .returning({ id: groupPromotions.id })

    if (row === undefined) throw new ValidationError('That rule could not be stored.')
    return row.id
  }

  async updateRule(id: number, input: PromotionRuleInput): Promise<void> {
    const rule = checked(input)

    const rows = await this.db
      .update(groupPromotions)
      .set({
        title: rule.title,
        displayOrder: rule.displayOrder,
        minPostCount: rule.minPostCount,
        minReputation: rule.minReputation,
        minDaysRegistered: rule.minDaysRegistered,
        fromPrimaryGroupId: rule.fromPrimaryGroupId,
        toPrimaryGroupId: rule.toPrimaryGroupId,
        updatedAt: new Date(),
      })
      .where(eq(groupPromotions.id, id))
      .returning({ id: groupPromotions.id })

    if (rows[0] === undefined) throw new ValidationError('No such promotion rule.')
  }

  async setRuleEnabled(id: number, enabled: boolean): Promise<void> {
    const rows = await this.db
      .update(groupPromotions)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(groupPromotions.id, id))
      .returning({ id: groupPromotions.id })

    if (rows[0] === undefined) throw new ValidationError('No such promotion rule.')
  }

  async deleteRule(id: number): Promise<void> {
    await this.db.delete(groupPromotions).where(eq(groupPromotions.id, id))
  }

  async candidates(afterUserId: number, limit: number): Promise<readonly PromotionCandidate[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        postCount: users.postCount,
        reputation: users.reputation,
        registeredAt: users.createdAt,
        primaryGroupId: users.primaryGroupId,
      })
      .from(users)
      .where(gt(users.id, afterUserId))
      .orderBy(asc(users.id))
      .limit(limit)

    return rows
  }

  async applyPromotions(outcomes: readonly PromotionOutcome[]): Promise<void> {
    if (outcomes.length === 0) return

    await this.db.transaction(async (tx) => {
      const values = sql.join(
        outcomes.map((o) => sql`(${o.userId}::int, ${o.toPrimaryGroupId}::int)`),
        sql`, `,
      )

      const displayGroup = keptDisplayGroupSql({
        column: sql.raw('u.display_group_id'),
        leavingGroupId: sql.raw('u.primary_group_id'),
        arrivingGroupId: sql.raw('v.group_id'),
      })

      await tx.execute(sql`
        update ${users} as u
        set primary_group_id = v.group_id, display_group_id = ${displayGroup}
        from (values ${values}) as v(user_id, group_id)
        where u.id = v.user_id
      `)

      await tx.execute(sql`
        insert into cache_versions (key, version)
        values ('permissions', 1)
        on conflict (key) do update set version = cache_versions.version + 1, bumped_at = now()
      `)
    })
  }
}
