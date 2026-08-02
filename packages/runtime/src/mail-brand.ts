/**
 * F55 — the board, as an outgoing e-mail sees it.
 *
 * Three values, from three places, resolved per delivery rather than at
 * startup: a worker process can outlive several settings changes, and a message
 * that goes out under last week's board name is a support ticket.
 *
 *  - **name** — the `board.name` setting (F08), which is what the board calls
 *    itself everywhere else.
 *  - **origin** — `APP_URL`, because a link in an e-mail has to be absolute and
 *    nothing in a queued job knows the request that caused it. When it is
 *    unset, `renderNotificationMail` sends the message *without* its link
 *    rather than with a broken one.
 *  - **accent** — the board's own accent token, including a database override
 *    (F26), so a board that has been recoloured sends mail that matches it.
 *
 * The accent is the one that makes "themed mail" mean something rather than
 * being a slogan, and it is also the one with a stated limit: mail clients
 * strip `<style>` and do not implement custom properties, so a *token cascade*
 * cannot travel. One resolved colour can, and does.
 */
import { env, logger } from '@forum/core'
import { PostgresSettingsRepository, PostgresThemeRepository, type Database } from '@forum/db'
import type { MailBrand } from '@forum/notifications'
import { SettingsSnapshot } from '@forum/settings'

/**
 * The theme whose tokens brand the mail.
 *
 * The *installed* theme is app configuration — `forum.config.ts`, read by the
 * app tier — and the worker and the CLI have no access to it, so callers that
 * know pass it in and everything else takes the key every board ships with.
 * Getting it wrong costs the fallback colour and nothing else.
 */
export const DEFAULT_THEME_KEY = 'default'

/**
 * The colour used when the board has overridden nothing, or has overridden it
 * with something this path will not emit. Deliberately a plain blue rather than
 * a token name: a token name in an e-mail resolves to nothing.
 */
const FALLBACK_ACCENT = '#3b5998'

/** Token keys checked, in order, for something to accent the message with. */
const ACCENT_KEYS = ['primary', 'accent', 'brand'] as const

function readAccent(overrides: unknown): string | null {
  if (overrides === null || typeof overrides !== 'object') return null
  const record = overrides as Record<string, unknown>

  for (const key of ACCENT_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    /*
     * F26 stores one map for both schemes (D39), so an override may be nested
     * under a scheme rather than sitting at the top level. Light is the one to
     * take: an e-mail is read against whatever background the client chooses,
     * and the light palette is the one designed to survive a white one.
     */
    const light = record['light']
    if (light !== null && typeof light === 'object') {
      const nested = (light as Record<string, unknown>)[key]
      if (typeof nested === 'string' && nested.trim() !== '') return nested.trim()
    }
  }
  return null
}

/**
 * Resolve the brand.
 *
 * Never throws. A mail job that fails because the settings table was briefly
 * unavailable would be retried by the queue and eventually dead-lettered — over
 * a *name*. Every value here has a usable default, so a failed read degrades
 * the message rather than losing it.
 */
export async function resolveMailBrand(deps: {
  readonly db: Database
  readonly themeKey?: string
}): Promise<MailBrand> {
  const themeKey = deps.themeKey ?? DEFAULT_THEME_KEY

  let boardName = ''
  let accent: string | null = null

  try {
    const overrides = await new PostgresSettingsRepository(deps.db).loadAll()
    boardName = SettingsSnapshot.fromOverrides(new Map(overrides)).get('board.name')
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read board name for mail')
  }

  try {
    const theme = await new PostgresThemeRepository(deps.db).findRuntimeByKey(themeKey)
    accent = readAccent(theme?.tokenOverrides ?? null)
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read theme tokens for mail')
  }

  return {
    boardName,
    boardUrl: env.APP_URL ?? '',
    accent: accent ?? FALLBACK_ACCENT,
  }
}
