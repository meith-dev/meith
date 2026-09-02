import { type SQL, sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import type { PluginData } from '@meith/plugin-kit'

import type { Database } from './client'
import type { Tx } from './permission-version'
import { pluginDbRole } from './plugin-role'
import { resultRows } from './result-rows'

export interface PluginDataOptions {
  readonly statementTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 3_000

export function bindPluginSql(
  text: string,
  params: readonly unknown[],
  where = 'plugin query',
): SQL {
  const out = sql.empty()
  let last = 0

  for (const match of text.matchAll(/\$(\d+)/g)) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= params.length) {
      throw new ValidationError(
        `${where}: the statement names $${match[1]} but only ${params.length} parameter(s) were passed.`,
      )
    }
    out.append(sql.raw(text.slice(last, match.index)))
    out.append(sql`${params[index]}`)
    last = match.index + match[0].length
  }

  out.append(sql.raw(text.slice(last)))
  return out
}

function onExecutor(executor: Tx, where: string): PluginData {
  const run = async (text: string, params: readonly unknown[] = []) => {
    return resultRows<Record<string, unknown>>(
      await executor.execute(bindPluginSql(text, params, where)),
    )
  }

  const data: PluginData = {
    async query(text, params) {
      return (await run(text, params ?? [])) as never
    },
    async one(text, params) {
      const rows = await run(text, params ?? [])
      return (rows[0] ?? null) as never
    },
    async tx(work) {
      return work(data)
    },
  }
  return data
}

export function pluginData(
  db: Database,
  pluginKey: string,
  options: PluginDataOptions = {},
): PluginData {
  const timeoutMs = Math.max(1, Math.trunc(options.statementTimeoutMs ?? DEFAULT_TIMEOUT_MS))
  const where = `plugin "${pluginKey}"`
  const role = pluginDbRole(pluginKey)

  const inTransaction = async <T>(work: (data: PluginData) => Promise<T>): Promise<T> => {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local statement_timeout = ${timeoutMs}`))
      await tx.execute(sql.raw(`set local role "${role.replace(/"/g, '""')}"`))
      return work(onExecutor(tx, where))
    })
  }

  return {
    async query(text, params) {
      return inTransaction(async (data) => data.query(text, params))
    },
    async one(text, params) {
      return inTransaction(async (data) => data.one(text, params))
    },
    async tx(work) {
      return inTransaction(work)
    },
  }
}
