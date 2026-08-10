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

export const NOT_SECRET_DESPITE_THE_NAME: ReadonlySet<string> = new Set([
  'MAIL_HTTP_ENDPOINT',
  'S3_ENDPOINT',
  'APP_URL',
  'S3_ACCESS_KEY_ID',
  'MAIL_SMTP_USERNAME',
])

export function looksLikeCredential(name: string): boolean {
  return /SECRET|PASSWORD|TOKEN|_KEY|URL$/.test(name)
}
