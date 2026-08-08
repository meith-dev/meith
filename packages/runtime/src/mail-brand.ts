/**
 * F55 — the board, as an outgoing e-mail sees it.
 *
 * Three values, from three places, resolved per delivery rather than at
 * startup: a worker process can outlive several settings changes, and a message
 * that goes out under last week's board name is a support ticket.
 *
 *  - **name** — the `board.name` setting (F08), which is what the board calls
 *    itself everywhere else.
 *  - **origin** — the board's address, because a link in an e-mail has to be
 *    absolute and nothing in a queued job knows the request that caused it.
 *    `APP_URL` or the `board.url` setting, in that order. When neither is set,
 *    `renderNotificationMail` sends the message *without* its link rather than
 *    with a broken one.
 *  - **accent** — the board's own accent token, including a database override
 *    (F26), so a board that has been recoloured sends mail that matches it.
 *
 * The accent is the one that makes "themed mail" mean something rather than
 * being a slogan, and it is also the one with a stated limit: mail clients
 * strip `<style>` and do not implement custom properties, so a *token cascade*
 * cannot travel. One resolved colour can, and does.
 */
import { env, logger } from '@meith/core'
import { PostgresSettingsRepository, PostgresThemeRepository, type Database } from '@meith/db'
import type { MailBrand } from '@meith/notifications'
import { SettingsSnapshot, resolveBoardUrl } from '@meith/settings'

/**
 * The theme whose tokens brand the mail.
 *
 * The *installed* theme is app configuration — `community.config.ts`, read by the
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
     * Overrides are keyed by colour scheme — `{ light: {…}, dark: {…} }` — and
     * were a single flat map for both schemes before members could switch
     * themes (D39), which is what the check above still reads. Light is the one
     * to take: an e-mail is read against whatever background the client
     * chooses, and the light palette is the one designed to survive a white one.
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
  let fromName = ''
  let boardUrl = ''
  let accent: string | null = null

  try {
    const overrides = await new PostgresSettingsRepository(deps.db).loadAll()
    const settings = SettingsSnapshot.fromOverrides(new Map(overrides))
    boardName = settings.get('board.name')
    /*
     * The sender's display name (`mail.from_name`), resolved here with the
     * board name and for the same reason: it is a setting, this runs per
     * delivery, and a worker that resolved it once at startup would sign every
     * message for the rest of its life with whatever the board was called then.
     * The *address* belongs to the driver — `MAIL_FROM`, or the board's
     * `mail.from` setting when the environment leaves that decision to the
     * board (see `@meith/settings/mail`).
     */
    fromName = settings.get('mail.from_name')
    /*
     * Resolved from the snapshot already in hand rather than from `env` alone.
     * The board's address is a setting as well as `APP_URL` now (the installer
     * collects it), and the worker has no request and no Next cache — so this
     * read, which was happening anyway for the name, answers it too.
     */
    boardUrl = resolveBoardUrl({ environment: env, settings }).url
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
    fromName,
    boardUrl,
    accent: accent ?? FALLBACK_ACCENT,
  }
}

/**
 * The sender's display name alone (`mail.from_name`).
 *
 * For callers that need the name and nothing else — mass mail, which has its
 * own subject and body and no use for the accent colour or the board URL.
 * Reading the whole brand there would pull in the theme repository once per
 * recipient to answer a question nobody asked.
 *
 * Degrades to the bare address on a failed read, like everything else here: a
 * missing display name is a cosmetic loss, and losing the message is not.
 */
export async function resolveSenderName(db: Database): Promise<string> {
  try {
    const overrides = await new PostgresSettingsRepository(db).loadAll()
    return SettingsSnapshot.fromOverrides(new Map(overrides)).get('mail.from_name')
  } catch (err) {
    logger({ module: 'mail-brand' }).warn({ err }, 'could not read the sender name for mail')
    return ''
  }
}
