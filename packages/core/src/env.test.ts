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

const onVercel = {
  ...base,
  VERCEL: '1',
  DIRECT_DATABASE_URL: 'postgres://u:p@direct.localhost:5432/forum',
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
    expect(() => parseEnv({ ...onVercel, FILESTORE_DRIVER: 'local' })).toThrow(/FILESTORE_DRIVER/)
  })

  it('says what to do about it, because the default is the broken one', () => {
    expect(() => parseEnv({ ...onVercel, FILESTORE_DRIVER: 'local' })).toThrow(
      /FILESTORE_DRIVER=s3/,
    )
  })

  it('allows local disk everywhere else, which is where it is correct', () => {
    const env = parseEnv({ ...base, FILESTORE_DRIVER: 'local' })
    expect(env.FILESTORE_DRIVER).toBe('local')
  })

  it('allows an object store on Vercel, which is the whole point', () => {
    const env = parseEnv({
      ...onVercel,
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
    ...onVercel,
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

  it('never sends the Resend key to an endpoint someone else chose', () => {
    const env = parseEnv({
      ...withKey,
      MAIL_HTTP_ENDPOINT: 'https://api.other.example/send',
    })

    expect(env.MAIL_HTTP_ENDPOINT).toBe('https://api.other.example/send')
    expect(env.MAIL_HTTP_TOKEN).toBeUndefined()
    expect(env.MAIL_DRIVER).toBe('log')
  })

  it("does not point someone else's token at Resend either", () => {
    const env = parseEnv({ ...withKey, MAIL_HTTP_TOKEN: 'other-token' })

    expect(env.MAIL_HTTP_TOKEN).toBe('other-token')
    expect(env.MAIL_HTTP_ENDPOINT).toBeUndefined()
    expect(env.MAIL_DRIVER).toBe('log')
  })

  it('names what is missing when half a mail API is set on purpose', () => {
    expect(() =>
      parseEnv({
        ...withKey,
        MAIL_DRIVER: 'http',
        MAIL_HTTP_ENDPOINT: 'https://api.other.example/send',
      }),
    ).toThrow(/MAIL_HTTP_TOKEN/)
  })
})

describe('the sender, when the provider published the domain it verified', () => {
  const linked = {
    ...base,
    DATA_SOURCE: 'postgres',
    QUEUE_DRIVER: 'postgres',
    RESEND_API_KEY: 're_abc123',
    RESEND_EMAIL_DOMAIN: 'mail.example.com',
  } satisfies Record<string, string>

  it('sends from the verified domain, so a linked provider needs nothing typed', () => {
    const env = parseEnv(linked)

    expect(env.MAIL_FROM).toBe('noreply@mail.example.com')
    expect(env.MAIL_DRIVER).toBe('http')
  })

  it('lets an address the board set win over the one it would derive', () => {
    const env = parseEnv({ ...linked, MAIL_FROM: 'hello@example.com' })

    expect(env.MAIL_FROM).toBe('hello@example.com')
  })

  it('refuses to guess a sender from a key alone, and stays on the log driver', () => {
    const { RESEND_EMAIL_DOMAIN: _domain, ...keyOnly } = linked
    const env = parseEnv(keyOnly)

    expect(env.MAIL_FROM).toBeUndefined()
    expect(env.MAIL_DRIVER).toBe('log')
  })

  it('derives nothing from a domain with no key behind it', () => {
    const { RESEND_API_KEY: _key, ...domainOnly } = linked
    const env = parseEnv(domainOnly)

    expect(env.MAIL_FROM).toBeUndefined()
    expect(env.MAIL_DRIVER).toBe('log')
  })

  it('refuses a domain that is not one, under the name the operator set', () => {
    expect(() => parseEnv({ ...linked, RESEND_EMAIL_DOMAIN: 'https://mail.example.com' })).toThrow(
      /RESEND_EMAIL_DOMAIN/,
    )
  })

  it('names only that variable, not the sender nobody typed', () => {
    try {
      parseEnv({ ...linked, RESEND_EMAIL_DOMAIN: 'https://mail.example.com' })
      expect.unreachable('a malformed domain must be refused')
    } catch (error) {
      expect((error as Error).message).not.toContain('MAIL_FROM')
    }
  })
})

/**
 * The bridge owns one driver. A board that moved to another provider and left
 * `RESEND_API_KEY` behind must not start sending through that provider with an
 * envelope sender at Resend's domain, which it has not authorised — a silent
 * wrong sender in place of a boot that names what is missing.
 */
describe('a board that moved off Resend without deleting the key', () => {
  const movedOn = {
    ...base,
    DATA_SOURCE: 'postgres',
    QUEUE_DRIVER: 'postgres',
    RESEND_API_KEY: 're_abc123',
    RESEND_EMAIL_DOMAIN: 'mail.example.com',
    MAIL_DRIVER: 'smtp',
    MAIL_SMTP_HOST: 'smtp.other.example',
  } satisfies Record<string, string>

  it('still refuses to boot without a sender, rather than inventing one', () => {
    expect(() => parseEnv(movedOn)).toThrow(/MAIL_FROM/)
  })

  it('sends the new provider nothing that was issued for Resend', () => {
    const env = parseEnv({ ...movedOn, MAIL_FROM: 'board@other.example' })

    expect(env.MAIL_FROM).toBe('board@other.example')
    expect(env.MAIL_HTTP_TOKEN).toBeUndefined()
    expect(env.MAIL_HTTP_ENDPOINT).toBeUndefined()
  })

  it('still bridges when the driver it owns is the one that is set', () => {
    const { MAIL_SMTP_HOST: _host, ...overHttp } = movedOn
    const env = parseEnv({ ...overHttp, MAIL_DRIVER: 'http' })

    expect(env.MAIL_FROM).toBe('noreply@mail.example.com')
    expect(env.MAIL_HTTP_ENDPOINT).toBe('https://api.resend.com/emails')
  })
})

describe('what the platform publishes, and what the board makes of it', () => {
  const BLOB_TOKEN = 'vercel_blob_rw_store123_secret'

  const PUBLISHED = {
    KV_URL: 'rediss://default:token@upstash.example:6379',
    KV_REST_API_URL: 'https://upstash.example',
    KV_REST_API_TOKEN: 'rest-token',
    DATABASE_URL_UNPOOLED: 'postgres://u:p@direct.example:5432/forum',
    POSTGRES_URL_NON_POOLING: 'postgres://u:p@other-direct.example:5432/forum',
    POSTGRES_URL: 'postgres://u:p@pooler.example:6543/forum',
  } satisfies Record<string, string>

  const STORE_OWN = {
    BLOB_STORE_ID: 'store_abc123',
    BLOB_WEBHOOK_PUBLIC_KEY: 'webhook-key',
  } satisfies Record<string, string>

  const INJECTED = { ...PUBLISHED, ...STORE_OWN } satisfies Record<string, string>

  const onVercel = {
    NODE_ENV: 'production',
    VERCEL: '1',
    AUTH_SECRET: 'a'.repeat(32),
    CRON_SECRET: 'c'.repeat(32),
    DATABASE_URL: 'postgres://u:p@pooler.example:6543/forum',
  } satisfies NodeJS.ProcessEnv

  const deployed = { ...onVercel, ...INJECTED }

  describe('deriving what the operator would otherwise copy by hand', () => {
    it('boots a linked project with nothing typed but the two secrets', () => {
      expect(parseEnv(deployed)).toMatchObject({
        DATA_SOURCE: 'postgres',
        QUEUE_DRIVER: 'postgres',
        CACHE_DRIVER: 'redis',
        FILESTORE_DRIVER: 'blob',
      })
    })

    it('takes the store id alone, which is all a linked Blob store publishes', () => {
      const env = parseEnv(deployed)

      expect(env.BLOB_STORE_ID).toBe(STORE_OWN.BLOB_STORE_ID)
      expect(env.BLOB_READ_WRITE_TOKEN).toBeUndefined()
      expect(env.FILESTORE_DRIVER).toBe('blob')
    })

    it('takes a read-write token instead, for a store that was set up by hand', () => {
      const { BLOB_STORE_ID: _id, ...withoutId } = deployed
      expect(parseEnv({ ...withoutId, BLOB_READ_WRITE_TOKEN: BLOB_TOKEN }).FILESTORE_DRIVER).toBe(
        'blob',
      )
    })

    it('takes the cache URL from the one Upstash variable that speaks the protocol', () => {
      expect(parseEnv(deployed).REDIS_URL).toBe(INJECTED.KV_URL)
    })

    it('falls through to the next candidate when the first is absent', () => {
      const { KV_URL: _kv, ...withoutKv } = deployed
      expect(
        parseEnv({ ...withoutKv, UPSTASH_REDIS_URL: 'redis://cache.example:6379' }).REDIS_URL,
      ).toBe('redis://cache.example:6379')
    })

    it('takes the direct database URL from Neon, preferring the name beside DATABASE_URL', () => {
      expect(parseEnv(deployed).DIRECT_DATABASE_URL).toBe(INJECTED.DATABASE_URL_UNPOOLED)
    })

    it('falls back to the other unpooled name Neon publishes', () => {
      const { DATABASE_URL_UNPOOLED: _unpooled, ...withoutUnpooled } = deployed
      expect(parseEnv(withoutUnpooled).DIRECT_DATABASE_URL).toBe(INJECTED.POSTGRES_URL_NON_POOLING)
    })

    it('never takes the pooled string for the direct one', () => {
      const {
        DATABASE_URL_UNPOOLED: _unpooled,
        POSTGRES_URL_NON_POOLING: _nonPooling,
        ...pooledOnly
      } = deployed

      expect(() => parseEnv(pooledOnly)).toThrow(/DIRECT_DATABASE_URL/)
    })

    it('derives no direct URL for a board that has no database at all', () => {
      const { DATABASE_URL: _db, ...fixtureBoard } = deployed
      const env = parseEnv({ ...fixtureBoard, NODE_ENV: 'development' })

      expect(env.DATA_SOURCE).toBe('fixture')
      expect(env.DIRECT_DATABASE_URL).toBeUndefined()
    })
  })

  describe('explicit configuration wins', () => {
    it('leaves an explicit cache driver alone, and asks for no Redis it does not need', () => {
      const { KV_URL: _kv, ...withoutCache } = deployed
      expect(parseEnv({ ...withoutCache, CACHE_DRIVER: 'next' }).CACHE_DRIVER).toBe('next')
    })

    it('keeps a REDIS_URL that was set by hand', () => {
      const env = parseEnv({ ...deployed, REDIS_URL: 'rediss://mine.example:6379' })
      expect(env.REDIS_URL).toBe('rediss://mine.example:6379')
    })

    it('keeps a bucket chosen over the Blob store that is also attached', () => {
      const env = parseEnv({
        ...deployed,
        FILESTORE_DRIVER: 's3',
        S3_BUCKET: 'board',
        S3_REGION: 'auto',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
      })
      expect(env.FILESTORE_DRIVER).toBe('s3')
    })

    it('keeps a DIRECT_DATABASE_URL that was set by hand', () => {
      const env = parseEnv({ ...deployed, DIRECT_DATABASE_URL: 'postgres://u:p@mine:5432/forum' })
      expect(env.DIRECT_DATABASE_URL).toBe('postgres://u:p@mine:5432/forum')
    })
  })

  describe('a board that is not on Vercel', () => {
    const selfHosted = {
      NODE_ENV: 'production',
      DATA_SOURCE: 'postgres',
      DATABASE_URL: 'postgres://forum:pw@postgres:5432/forum',
      QUEUE_DRIVER: 'postgres',
      AUTH_SECRET: 'a'.repeat(40),
      TICK_SECRET: 'b'.repeat(40),
    } satisfies NodeJS.ProcessEnv

    const shapes: readonly NodeJS.ProcessEnv[] = [
      selfHosted,
      { ...selfHosted, CACHE_DRIVER: 'next', FILESTORE_DRIVER: 'local' },
      { ...selfHosted, CACHE_DRIVER: 'redis', REDIS_URL: 'redis://cache:6379' },
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' },
    ]

    it.each(shapes.map((shape, index) => [index, shape] as const))(
      'parses shape %i exactly as it would with none of those names present',
      (_index, shape) => {
        const own = { ...STORE_OWN, BLOB_READ_WRITE_TOKEN: BLOB_TOKEN }
        expect(parseEnv({ ...shape, ...PUBLISHED, ...own })).toEqual(parseEnv({ ...shape, ...own }))
      },
    )

    it('still defaults the cache and the file store the way it always did', () => {
      const env = parseEnv({ ...selfHosted, ...PUBLISHED })

      expect(env.CACHE_DRIVER).toBe('next')
      expect(env.FILESTORE_DRIVER).toBe('local')
      expect(env.REDIS_URL).toBeUndefined()
      expect(env.DIRECT_DATABASE_URL).toBeUndefined()
    })

    it('boots with no cache configured at all, which is not an error off Vercel', () => {
      expect(() => parseEnv(selfHosted)).not.toThrow()
    })
  })

  describe('a derivation that cannot resolve refuses to boot', () => {
    const bare = { ...onVercel }

    it('refuses the cache rather than caching inside an instance that will vanish', () => {
      expect(() => parseEnv({ ...bare, ...INJECTED, KV_URL: undefined })).toThrow(
        /CACHE_DRIVER: cannot be derived on Vercel.*KV_URL, UPSTASH_REDIS_URL/s,
      )
    })

    it('says which name it looked at and found the wrong protocol in', () => {
      expect(() => parseEnv({ ...bare, ...INJECTED, KV_URL: INJECTED.KV_REST_API_URL })).toThrow(
        /KV_URL is set but does not hold a redis:\/\/ or rediss:\/\/ URL/,
      )
    })

    it('names the REST endpoint as the thing it is deliberately not using', () => {
      expect(() => parseEnv({ ...bare, ...INJECTED, KV_URL: undefined })).toThrow(
        /KV_REST_API_URL is deliberately not among them/,
      )
    })

    it('refuses an explicitly chosen redis cache with no URL to reach it on', () => {
      expect(() =>
        parseEnv({ ...bare, ...INJECTED, KV_URL: undefined, CACHE_DRIVER: 'redis' }),
      ).toThrow(/REDIS_URL: is required when CACHE_DRIVER=redis.*KV_URL/s)
    })

    const noStore = { ...bare, ...INJECTED, BLOB_STORE_ID: undefined }

    it('refuses the file store rather than writing uploads to a disk that is going away', () => {
      expect(() => parseEnv(noStore)).toThrow(
        /FILESTORE_DRIVER: cannot be derived on Vercel.*BLOB_STORE_ID, BLOB_READ_WRITE_TOKEN/s,
      )
    })

    it('does not treat a store id without a token as the broken case, because it is not', () => {
      expect(() => parseEnv({ ...bare, ...INJECTED })).not.toThrow()
    })

    it('offers the bucket in the refusal, and never local', () => {
      expect(() => parseEnv(noStore)).toThrow(/FILESTORE_DRIVER=s3/)
      expect(() => parseEnv(noStore)).toThrow(/FILESTORE_DRIVER=local is not the answer/)
    })

    it('asks for no OIDC token of its own, which a build would not have', () => {
      const env = parseEnv({ ...bare, ...INJECTED })
      expect(env.FILESTORE_DRIVER).toBe('blob')

      let refusal = ''
      try {
        parseEnv(noStore)
      } catch (error) {
        refusal = (error as Error).message
      }

      expect(refusal).toMatch(/BLOB_STORE_ID/)
      expect(refusal).not.toMatch(/OIDC_TOKEN/)
    })

    it('refuses a token that names no store, at boot rather than at the first upload', () => {
      expect(() =>
        parseEnv({ ...bare, ...INJECTED, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_' }),
      ).toThrow(/BLOB_READ_WRITE_TOKEN.*vercel_blob_rw_<store>_<secret>/s)
    })

    it('refuses it with no store id either, where nothing else would ever catch it', () => {
      expect(() =>
        parseEnv({ ...bare, ...INJECTED, BLOB_STORE_ID: undefined, BLOB_READ_WRITE_TOKEN: 'nope' }),
      ).toThrow(/BLOB_READ_WRITE_TOKEN/)
    })

    it('says the store id is credential enough, for an operator who can just drop it', () => {
      expect(() => parseEnv({ ...bare, ...INJECTED, BLOB_READ_WRITE_TOKEN: 'nope' })).toThrow(
        /BLOB_STORE_ID, which is credential enough by itself/,
      )
    })

    it('leaves a good token alone, on or off the platform', () => {
      const token = 'vercel_blob_rw_store123_secret'

      expect(
        parseEnv({ ...bare, ...INJECTED, BLOB_READ_WRITE_TOKEN: token }).BLOB_READ_WRITE_TOKEN,
      ).toBe(token)
      expect(
        parseEnv({
          NODE_ENV: 'development',
          BLOB_READ_WRITE_TOKEN: token,
        }).BLOB_READ_WRITE_TOKEN,
      ).toBe(token)
    })

    it('names both database candidates when neither is published', () => {
      expect(() =>
        parseEnv({
          ...bare,
          ...INJECTED,
          DATABASE_URL_UNPOOLED: undefined,
          POSTGRES_URL_NON_POOLING: undefined,
        }),
      ).toThrow(/DIRECT_DATABASE_URL.*DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING/s)
    })

    it('reports every unresolved derivation at once, not one deploy at a time', () => {
      let message = ''
      try {
        parseEnv(bare)
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).toMatch(/CACHE_DRIVER:/)
      expect(message).toMatch(/FILESTORE_DRIVER:/)
      expect(message).toMatch(/DIRECT_DATABASE_URL:/)
    })

    it('leaves `next build` alone, which has no request to serve and no store to reach', () => {
      expect(() => parseEnv({ ...bare, NEXT_PHASE: 'phase-production-build' })).not.toThrow()
    })

    it('refuses the same environment when it is a running server being validated', () => {
      expect(() =>
        parseEnv({ ...bare, NEXT_PHASE: 'phase-production-build' }, { ignoreBuildPhase: true }),
      ).toThrow(/CACHE_DRIVER/)
    })
  })
})
