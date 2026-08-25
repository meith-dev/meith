import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

const base = {
  NODE_ENV: 'production',
  AUTH_SECRET: 'a'.repeat(32),
  TICK_SECRET: 'b'.repeat(32),
  DATABASE_URL: 'postgres://u:p@localhost:5432/forum',
  CACHE_DRIVER: 'redis',
  REDIS_URL: 'redis://localhost:6379',
} satisfies NodeJS.ProcessEnv

describe('derived defaults', () => {
  it('falls back to the fixture data source when no database is configured', () => {
    const env = parseEnv({ NODE_ENV: 'development' })
    expect(env.DATA_SOURCE).toBe('fixture')
    expect(env.QUEUE_DRIVER).toBe('memory')
    expect(env.CACHE_DRIVER).toBe('memory')
  })

  it('derives the postgres drivers from a bare DATABASE_URL', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/forum',
    })
    expect(env.DATA_SOURCE).toBe('postgres')
    expect(env.QUEUE_DRIVER).toBe('postgres')
  })
})

describe('an empty variable is an unset one', () => {
  const asCompose = {
    NODE_ENV: 'production',
    DATA_SOURCE: 'postgres',
    DATABASE_URL: 'postgres://forum:pw@postgres:5432/forum',
    AUTH_SECRET: 'a'.repeat(40),
    TICK_SECRET: 'b'.repeat(40),
    QUEUE_DRIVER: 'postgres',
    CACHE_DRIVER: 'next',
    FILESTORE_DRIVER: 'local',
    MAIL_DRIVER: 'log',
    MAIL_HTTP_ENDPOINT: '',
    MAIL_HTTP_TOKEN: '',
    MAIL_FROM: '',
  } satisfies NodeJS.ProcessEnv

  it('boots a board whose optional features are simply not configured', () => {
    const env = parseEnv(asCompose)
    expect(env.MAIL_DRIVER).toBe('log')
    expect(env.MAIL_FROM).toBeUndefined()
    expect(env.MAIL_HTTP_ENDPOINT).toBeUndefined()
  })

  it('treats whitespace as empty, since that is a paste with a newline in it', () => {
    expect(parseEnv({ ...asCompose, APP_URL: '  ' }).APP_URL).toBeUndefined()
  })

  it('still refuses a required secret, and calls it missing rather than malformed', () => {
    expect(() => parseEnv({ ...asCompose, AUTH_SECRET: '' })).toThrow(/AUTH_SECRET.*is required/)
  })

  it('does not excuse a value that is genuinely wrong', () => {
    expect(() =>
      parseEnv({ ...asCompose, MAIL_FROM: 'not-an-address', MAIL_DRIVER: 'http' }),
    ).toThrow(/MAIL_FROM/)
  })
})

describe('cross-field rules', () => {
  it('names the offending variable, not just "invalid config"', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', DATA_SOURCE: 'postgres' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('rejects a redis cache with no REDIS_URL', () => {
    expect(() => parseEnv({ ...base, REDIS_URL: undefined })).toThrow(/REDIS_URL/)
  })

  it('rejects a REDIS_URL that is not a redis connection string', () => {
    expect(() => parseEnv({ ...base, REDIS_URL: 'http://localhost:6379' })).toThrow(/REDIS_URL/)
  })

  it('no longer admits the redis queue it never implemented', () => {
    expect(() => parseEnv({ ...base, QUEUE_DRIVER: 'redis' })).toThrow(/QUEUE_DRIVER/)
  })

  it('rejects a low-entropy secret', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET/)
  })
})

describe('production rules', () => {
  it('refuses to boot a production server with a memory queue', () => {
    expect(() => parseEnv({ ...base, QUEUE_DRIVER: 'memory' })).toThrow(/QUEUE_DRIVER/)
  })

  it('refuses to boot a Vercel deployment writing uploads to local disk', () => {
    expect(() => parseEnv({ ...base, FILESTORE_DRIVER: 'local', VERCEL: '1' })).toThrow(
      /FILESTORE_DRIVER/,
    )
  })

  it('says what to do about it, because the default is the broken one', () => {
    expect(() => parseEnv({ ...base, FILESTORE_DRIVER: 'local', VERCEL: '1' })).toThrow(
      /FILESTORE_DRIVER=s3/,
    )
  })

  it('allows local disk everywhere else, which is where it is correct', () => {
    const env = parseEnv({ ...base, FILESTORE_DRIVER: 'local' })
    expect(env.FILESTORE_DRIVER).toBe('local')
  })

  it('allows an object store on Vercel, which is the whole point', () => {
    const env = parseEnv({
      ...base,
      VERCEL: '1',
      FILESTORE_DRIVER: 's3',
      S3_BUCKET: 'board',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    })
    expect(env.FILESTORE_DRIVER).toBe('s3')
  })

  it('requires AUTH_SECRET and TICK_SECRET in production', () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/)
    expect(() => parseEnv({ ...base, TICK_SECRET: undefined })).toThrow(/TICK_SECRET/)
  })

  it('takes CRON_SECRET instead, for a host whose cron can only send that name', () => {
    const env = parseEnv({ ...base, TICK_SECRET: undefined, CRON_SECRET: 'c'.repeat(32) })

    expect(env.CRON_SECRET).toBe('c'.repeat(32))
    expect(env.TICK_SECRET).toBeUndefined()
  })

  it('still refuses to run the tick unprotected when neither secret is set', () => {
    expect(() => parseEnv({ ...base, TICK_SECRET: undefined, CRON_SECRET: undefined })).toThrow(
      /TICK_SECRET/,
    )
  })

  it('holds CRON_SECRET to the same length as every other secret', () => {
    expect(() => parseEnv({ ...base, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/)
  })

  it('does not apply them during `next build`, which has no runtime secrets', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    })
    expect(env.QUEUE_DRIVER).toBe('memory')
    expect(env.AUTH_SECRET).toBeUndefined()
  })

  it('still applies them when NODE_ENV is production and no build is running', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-server' }),
    ).toThrow(/AUTH_SECRET/)
  })

  it('cannot be waived by NEXT_PHASE when validating for a running server', () => {
    const buildPhase = { NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' } as const

    expect(() => parseEnv(buildPhase)).not.toThrow()
    expect(() => parseEnv(buildPhase, { ignoreBuildPhase: true })).toThrow(/AUTH_SECRET/)
  })

  it('leaves the caller-supplied environment untouched', () => {
    const source: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    }
    expect(() => parseEnv(source, { ignoreBuildPhase: true })).toThrow()
    expect(source.NEXT_PHASE).toBe('phase-production-build')
  })
})

describe('demo mode', () => {
  const demo = {
    ...base,
    DATA_SOURCE: 'postgres',
    DATABASE_URL: 'postgres://u:p@localhost:5432/demo',
  } satisfies NodeJS.ProcessEnv

  it('is off unless something turns it on', () => {
    expect(parseEnv(base).DEMO_MODE).toBe(false)
  })

  it('accepts the two spellings a compose file is likely to use', () => {
    expect(parseEnv({ ...demo, DEMO_MODE: '1' }).DEMO_MODE).toBe(true)
    expect(parseEnv({ ...demo, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true)
    expect(parseEnv({ ...demo, DEMO_MODE: '0' }).DEMO_MODE).toBe(false)
    expect(parseEnv({ ...demo, DEMO_MODE: 'false' }).DEMO_MODE).toBe(false)
  })

  it('refuses a value it cannot read, rather than guessing that it means yes', () => {
    expect(() => parseEnv({ ...demo, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/)
  })

  it('refuses to arm a demo that has no write side', () => {
    expect(() => parseEnv({ ...base, DATA_SOURCE: 'fixture', DEMO_MODE: '1' })).toThrow(
      /DEMO_MODE.*DATA_SOURCE=postgres/s,
    )
  })

  it('defaults the reset interval to an hour, and bounds what may replace it', () => {
    expect(parseEnv(demo).DEMO_RESET_MINUTES).toBe(60)
    expect(parseEnv({ ...demo, DEMO_RESET_MINUTES: '15' }).DEMO_RESET_MINUTES).toBe(15)
    expect(() => parseEnv({ ...demo, DEMO_RESET_MINUTES: '1' })).toThrow(/DEMO_RESET_MINUTES/)
  })
})

describe('observability', () => {
  it('leaves metrics and tracing off unless something turns them on', () => {
    const env = parseEnv(base)
    expect(env.METRICS_ENABLED).toBe(false)
    expect(env.OTEL_ENABLED).toBe(false)
  })

  it('requires an OTLP endpoint once tracing is enabled', () => {
    expect(() => parseEnv({ ...base, OTEL_ENABLED: '1' })).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/)
    expect(
      parseEnv({
        ...base,
        OTEL_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector/v1/traces',
      }).OTEL_ENABLED,
    ).toBe(true)
  })

  it('requires a token for metrics in production, so the endpoint is not open to anyone', () => {
    expect(() => parseEnv({ ...base, METRICS_ENABLED: '1' })).toThrow(/METRICS_TOKEN/)
    expect(
      parseEnv({ ...base, METRICS_ENABLED: '1', METRICS_TOKEN: 'c'.repeat(32) }).METRICS_ENABLED,
    ).toBe(true)
  })

  it('does not demand a token outside production, where an unset one already warns at the route', () => {
    expect(() => parseEnv({ NODE_ENV: 'development', METRICS_ENABLED: '1' })).not.toThrow()
  })

  it('does not apply the metrics-token rule during `next build`', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
        METRICS_ENABLED: '1',
      }),
    ).not.toThrow()
  })
})

describe('the object store on a platform with no disk', () => {
  const serverless = {
    ...base,
    VERCEL: '1',
    DATA_SOURCE: 'postgres',
    QUEUE_DRIVER: 'postgres',
  } satisfies NodeJS.ProcessEnv

  it('accepts blob with the token a Blob store publishes', () => {
    const env = parseEnv({
      ...serverless,
      FILESTORE_DRIVER: 'blob',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store123_secret',
    })
    expect(env.FILESTORE_DRIVER).toBe('blob')
  })

  it('refuses blob without that token, naming it', () => {
    expect(() => parseEnv({ ...serverless, FILESTORE_DRIVER: 'blob' })).toThrow(
      /BLOB_READ_WRITE_TOKEN/,
    )
  })

  it('offers blob first when local is refused on Vercel', () => {
    expect(() => parseEnv({ ...serverless, FILESTORE_DRIVER: 'local' })).toThrow(
      /FILESTORE_DRIVER=blob/,
    )
  })

  it('leaves blob unselected when only the token is present', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'development',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store123_secret',
    })
    expect(env.FILESTORE_DRIVER).toBe('local')
  })
})

describe('a mail key injected under the provider name', () => {
  const withKey = {
    ...base,
    DATA_SOURCE: 'postgres',
    QUEUE_DRIVER: 'postgres',
    MAIL_FROM: 'board@example.com',
    RESEND_API_KEY: 're_abc123',
  } satisfies NodeJS.ProcessEnv

  it('carries RESEND_API_KEY into the generic token and endpoint', () => {
    const env = parseEnv(withKey)
    expect(env.MAIL_DRIVER).toBe('http')
    expect(env.MAIL_HTTP_TOKEN).toBe('re_abc123')
    expect(env.MAIL_HTTP_ENDPOINT).toBe('https://api.resend.com/emails')
  })

  it('lets an explicit endpoint and token win, so another provider still works', () => {
    const env = parseEnv({
      ...withKey,
      MAIL_HTTP_ENDPOINT: 'https://api.other.example/send',
      MAIL_HTTP_TOKEN: 'other-token',
    })
    expect(env.MAIL_HTTP_ENDPOINT).toBe('https://api.other.example/send')
    expect(env.MAIL_HTTP_TOKEN).toBe('other-token')
  })

  it('leaves mail alone until a sender is verified and named', () => {
    const { MAIL_FROM: _from, ...withoutSender } = withKey
    expect(parseEnv(withoutSender).MAIL_DRIVER).toBe('log')
  })

  it('does not override an explicit MAIL_DRIVER', () => {
    expect(parseEnv({ ...withKey, MAIL_DRIVER: 'log' }).MAIL_DRIVER).toBe('log')
  })

  it('leaves a board that configured the generic pair itself on its old default', () => {
    const { RESEND_API_KEY: _key, ...generic } = withKey
    const configured = {
      ...generic,
      MAIL_HTTP_ENDPOINT: 'https://api.other.example/send',
      MAIL_HTTP_TOKEN: 'other-token',
    }

    expect(parseEnv(configured).MAIL_DRIVER).toBe('log')
  })
})
