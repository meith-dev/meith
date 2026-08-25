import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

const SECRET = 'x'.repeat(48)

const SERVERLESS: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  VERCEL: '1',

  DATA_SOURCE: 'postgres',
  DATABASE_URL: 'postgres://board:pw@pooler.example:6543/board?pgbouncer=true',
  DIRECT_DATABASE_URL: 'postgres://board:pw@db.example:5432/board',

  QUEUE_DRIVER: 'postgres',
  CACHE_DRIVER: 'redis',
  REDIS_URL: 'rediss://default:token@cache.example:6379',

  FILESTORE_DRIVER: 's3',
  S3_BUCKET: 'board-uploads',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_PUBLIC_BASE_URL: 'https://files.example',

  MAIL_DRIVER: 'http',
  MAIL_FROM: 'board@example.com',
  MAIL_HTTP_ENDPOINT: 'https://api.provider.example/emails',
  MAIL_HTTP_TOKEN: 'provider-key',

  APP_URL: 'https://board.example',
  AUTH_SECRET: SECRET,
  TICK_SECRET: SECRET,
}

describe('the canonical serverless environment', () => {
  it('passes validation as a whole', () => {
    expect(() => parseEnv(SERVERLESS)).not.toThrow()
  })

  it('selects the drivers that hold no state on the instance', () => {
    expect(parseEnv(SERVERLESS)).toMatchObject({
      DATA_SOURCE: 'postgres',
      QUEUE_DRIVER: 'postgres',
      CACHE_DRIVER: 'redis',
      FILESTORE_DRIVER: 's3',
      MAIL_DRIVER: 'http',
    })
  })

  it('keeps a pooled URL for the app and a direct one for migrations', () => {
    const parsed = parseEnv(SERVERLESS)

    expect(parsed.DATABASE_URL).toContain('pooler.example')
    expect(parsed.DIRECT_DATABASE_URL).toContain('db.example')
  })

  it.each([
    ['DATABASE_URL', /DATABASE_URL/],
    ['REDIS_URL', /REDIS_URL/],
    ['S3_BUCKET', /S3_BUCKET/],
    ['MAIL_HTTP_ENDPOINT', /MAIL_HTTP_ENDPOINT/],
    ['AUTH_SECRET', /AUTH_SECRET/],
    ['TICK_SECRET', /TICK_SECRET/],
  ])('refuses the set without %s', (key, expected) => {
    expect(() => parseEnv({ ...SERVERLESS, [key]: undefined })).toThrow(expected)
  })

  it('still refuses a local file store on Vercel', () => {
    expect(() => parseEnv({ ...SERVERLESS, FILESTORE_DRIVER: 'local' })).toThrow(/FILESTORE_DRIVER/)
  })

  it('still refuses an in-memory queue in production', () => {
    expect(() => parseEnv({ ...SERVERLESS, QUEUE_DRIVER: 'memory' })).toThrow(/QUEUE_DRIVER/)
  })

  it('refuses SMTP on port 25, which serverless egress blocks', () => {
    expect(() =>
      parseEnv({
        ...SERVERLESS,
        MAIL_DRIVER: 'smtp',
        MAIL_SMTP_HOST: 'smtp.example',
        MAIL_SMTP_PORT: '25',
      }),
    ).toThrow(/MAIL_SMTP_PORT/)
  })

  it('accepts SMTP on 587 with STARTTLS, the port that usually survives', () => {
    expect(() =>
      parseEnv({
        ...SERVERLESS,
        MAIL_DRIVER: 'smtp',
        MAIL_SMTP_HOST: 'smtp.example',
        MAIL_SMTP_PORT: '587',
        MAIL_SMTP_SECURITY: 'starttls',
      }),
    ).not.toThrow()
  })
})
