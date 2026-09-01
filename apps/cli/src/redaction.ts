export const SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
  'AUTH_SECRET',
  'TICK_SECRET',
  'CRON_SECRET',
  'METRICS_TOKEN',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'MAIL_HTTP_TOKEN',
  'MAIL_SMTP_PASSWORD',
  'RESEND_API_KEY',
  'REDIS_URL',
  'S3_SECRET_ACCESS_KEY',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BLOB_READ_WRITE_TOKEN',
])

export const NOT_SECRET_DESPITE_THE_NAME: ReadonlySet<string> = new Set([
  'MAIL_HTTP_ENDPOINT',
  'S3_ENDPOINT',
  'S3_PUBLIC_BASE_URL',
  'APP_URL',
  'S3_ACCESS_KEY_ID',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_ENDPOINT',
  'MAIL_SMTP_USERNAME',
])

export function looksLikeCredential(name: string): boolean {
  return /SECRET|PASSWORD|TOKEN|_KEY|URL$/.test(name)
}
