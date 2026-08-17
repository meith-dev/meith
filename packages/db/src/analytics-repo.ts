import { sql } from 'drizzle-orm'

import {
  DIRECT_SOURCE,
  INTERNAL_SOURCE,
  type AnalyticsDay,
  type AnalyticsPage,
  type AnalyticsSource,
  type AnalyticsSummary,
  type DayKey,
} from '@meith/analytics'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface PageViewRecord {
  readonly day: DayKey
  readonly path: string
  readonly source: string
  readonly visitor: string
  readonly member: boolean
  readonly now: Date
}

export interface SummaryRequest {
  readonly from: DayKey
  readonly to: DayKey
  readonly topPages: number
  readonly topSources: number
}

export class PostgresAnalyticsRepository {
  constructor(private readonly db: Database) {}

  async record(view: PageViewRecord): Promise<void> {
    const memberView = view.member ? 1 : 0

    await this.db.execute(sql`
      with seen as (
        insert into analytics_visitors (day, visitor, member)
        values (${view.day}, ${view.visitor}, ${view.member})
        on conflict (day, visitor) do nothing
        returning member
      ),
      counted as (
        insert into analytics_days
          (day, views, member_views, visitors, member_visitors, updated_at)
        values (
          ${view.day}, 1, ${memberView},
          (select count(*)::int from seen),
          (select count(*)::int from seen where member),
          ${view.now}
        )
        on conflict (day) do update set
          views = analytics_days.views + 1,
          member_views = analytics_days.member_views + ${memberView},
          visitors = analytics_days.visitors + (select count(*)::int from seen),
          member_visitors =
            analytics_days.member_visitors + (select count(*)::int from seen where member),
          updated_at = ${view.now}
      ),
      page as (
        insert into analytics_pages (day, path, views)
        values (${view.day}, ${view.path}, 1)
        on conflict (day, path) do update set views = analytics_pages.views + 1
      )
      insert into analytics_sources (day, source, views)
      values (${view.day}, ${view.source}, 1)
      on conflict (day, source) do update set views = analytics_sources.views + 1
    `)
  }

  async summarise(request: SummaryRequest): Promise<AnalyticsSummary> {
    const [days, pages, sources, arrivals, recordedFrom] = await Promise.all([
      this.days(request),
      this.pages(request),
      this.sources(request),
      this.arrivals(request),
      this.earliestDay(),
    ])

    return {
      from: request.from,
      to: request.to,
      days,
      pages,
      sources,
      directViews: arrivals.direct,
      internalViews: arrivals.internal,
      recordedFrom,
    }
  }

  async prune(before: DayKey): Promise<number> {
    let removed = 0

    for (const table of [
      sql`analytics_days`,
      sql`analytics_pages`,
      sql`analytics_sources`,
      sql`analytics_visitors`,
    ]) {
      const result = await this.db.execute(
        sql`delete from ${table} where day < ${before} returning day`,
      )
      removed += resultRows(result).length
    }

    return removed
  }

  private async days(request: SummaryRequest): Promise<readonly AnalyticsDay[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select day::text as day, views, member_views, visitors, member_visitors
          from analytics_days
         where day >= ${request.from} and day <= ${request.to}
         order by day
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      day: String(row.day),
      views: Number(row.views),
      memberViews: Number(row.member_views),
      visitors: Number(row.visitors),
      memberVisitors: Number(row.member_visitors),
    }))
  }

  private async pages(request: SummaryRequest): Promise<readonly AnalyticsPage[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select path, sum(views)::int as views
          from analytics_pages
         where day >= ${request.from} and day <= ${request.to}
         group by path
         order by views desc, path
         limit ${request.topPages}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({ path: String(row.path), views: Number(row.views) }))
  }

  private async sources(request: SummaryRequest): Promise<readonly AnalyticsSource[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select source, sum(views)::int as views
          from analytics_sources
         where day >= ${request.from} and day <= ${request.to}
           and source not in (${DIRECT_SOURCE}, ${INTERNAL_SOURCE})
         group by source
         order by views desc, source
         limit ${request.topSources}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({ source: String(row.source), views: Number(row.views) }))
  }

  private async arrivals(
    request: SummaryRequest,
  ): Promise<{ direct: number; internal: number }> {
    const rows = resultRows(
      await this.db.execute(sql`
        select source, sum(views)::int as views
          from analytics_sources
         where day >= ${request.from} and day <= ${request.to}
           and source in (${DIRECT_SOURCE}, ${INTERNAL_SOURCE})
         group by source
      `),
    ) as Array<Record<string, unknown>>

    const counted = new Map(rows.map((row) => [String(row.source), Number(row.views)]))

    return {
      direct: counted.get(DIRECT_SOURCE) ?? 0,
      internal: counted.get(INTERNAL_SOURCE) ?? 0,
    }
  }

  private async earliestDay(): Promise<DayKey | null> {
    const rows = resultRows(
      await this.db.execute(sql`select min(day)::text as day from analytics_days`),
    ) as Array<Record<string, unknown>>

    const day = rows[0]?.day
    return day === null || day === undefined ? null : String(day)
  }
}
