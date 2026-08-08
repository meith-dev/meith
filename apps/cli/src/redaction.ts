/**
 * Which environment variables `community env` refuses to print.
 *
 * Its own module so a test can hold it against the schema that declares the
 * variables. That is not tidiness — it is the fix for how this list failed.
 *
 * ## A deny-list that nothing checked
 *
 * `community env` prints the resolved environment, and it is the command whose
 * output people paste into bug reports and support threads, which is the whole
 * reason it redacts anything. The redaction was a set of literal names sitting
 * inside the command handler, so adding a credential to `env.ts` printed it —
 * silently, with nothing to notice.
 *
 * That is exactly what happened when the SMTP transport arrived:
 * `MAIL_SMTP_PASSWORD` joined the schema, the set did not change, and
 * `community env` would have printed a mail password in full. It was found by
 * reading this file for an unrelated reason, which is not a mechanism.
 *
 * An allow-list would fail the safer way but would need a decision recorded for
 * every ordinary variable, and the ones people forget are the new ones either
 * way. So the list stays a deny-list and `redaction.test.ts` enforces its
 * *shape*: any variable in the schema whose name reads like a credential must
 * appear here, or the test names it and fails.
 */

/**
 * Names printed as `<set>` rather than as their value.
 *
 * `DATABASE_URL` and `REDIS_URL` are here for the password inside them, not for
 * the host — a connection string is a credential wearing a URL's clothes, which
 * is the reason the pattern in the test looks for `URL` at all.
 */
export const SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
  'AUTH_SECRET',
  'TICK_SECRET',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'MAIL_HTTP_TOKEN',
  'MAIL_SMTP_PASSWORD',
  'REDIS_URL',
  'S3_SECRET_ACCESS_KEY',
])

/**
 * Names that read like a credential and are not one.
 *
 * Every entry is a deliberate decision that printing this value is safe, which
 * is the point of naming them rather than loosening the pattern in the test: a
 * looser pattern stops catching the next real secret, and this list stays
 * readable and short.
 */
export const NOT_SECRET_DESPITE_THE_NAME: ReadonlySet<string> = new Set([
  /* An endpoint, and the operator needs to see which provider is configured. */
  'MAIL_HTTP_ENDPOINT',
  /* A bucket endpoint, for the same reason. */
  'S3_ENDPOINT',
  /* The board's own public origin. It is in every page's markup already. */
  'APP_URL',
  /* An account identifier, not a credential — and useless without the secret. */
  'S3_ACCESS_KEY_ID',
  /* A mailbox name. Shown, because "which account is it signing in as" is the
     first question when SMTP authentication fails. */
  'MAIL_SMTP_USERNAME',
])

/** Does this name read like something that must not be printed? */
export function looksLikeCredential(name: string): boolean {
  return /SECRET|PASSWORD|TOKEN|_KEY|URL$/.test(name)
}
