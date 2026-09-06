# Scaling out

One web container, one worker, one Postgres. That is the topology every
guide sets up, including the
[Deploying with Coolify](../setting-up/deployment/coolify.md), and it serves almost
every board. This page is for the board that has outgrown it, or that
wants more than one web container for resilience. The short version:
**set `CACHE_DRIVER=redis`, point `REDIS_URL` at a Valkey or Redis server,
give uploads a store every instance can reach, and add web containers.**

## What already scales

Most of the board's shared state lives in Postgres so that any process can
serve any request:

| State | Where it lives | Scaling behaviour |
|---|---|---|
| Sessions and remember tokens | Postgres | Any instance can answer any request. No sticky sessions, ever. |
| Rate limits and login lockouts | Postgres | Counted once, board-wide, however many instances saw the attempts. |
| The job queue | Postgres (`FOR UPDATE SKIP LOCKED`) | Any number of workers; each job is claimed by exactly one. |
| Scheduled tasks (the tick) | Postgres | Claim-based. Concurrent ticks from several workers are safe: one claims the task, the rest move on. |

Three things do **not** scale by default:

- **The cache.** `CACHE_DRIVER=next` and `memory` hold the board's global
  reads (settings, navigation, the forum tree, word filters, smilies, group
  colours and theme overrides) in a map inside the process. Each entry
  carries a sixty-second backstop, so a change made through one instance
  reaches the others within a minute, and until then the others serve the
  old value. `CACHE_DRIVER=redis` makes the cache one shared store, and a
  change made anywhere is served everywhere from the next request.
- **Uploads.** `FILESTORE_DRIVER=local` writes to a disk, and a second
  instance on another machine has a different disk: an avatar uploaded
  through one instance would 404 from the other. Replicas on **one**
  machine may share the uploads volume. The moment instances span
  machines, switch to `FILESTORE_DRIVER=s3`: any S3-compatible bucket,
  configured with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and
  `S3_SECRET_ACCESS_KEY`, plus `S3_ENDPOINT` for a non-AWS bucket such as
  R2.
- **Metrics.** `/api/metrics` (see [Monitoring & alerting](./monitoring.md))
  holds its counters and histograms in the process that answers the scrape.
  Every web instance and the worker is a separate scrape target with its
  own numbers. A Prometheus job with several targets sums them at query
  time; there is no board-wide total to read from any one of them.

## What Redis is, and is not, used for

Redis holds cache entries and nothing else. Sessions, posts, jobs and rate
limits stay in Postgres. Losing the Redis server costs the board a warm
cache, which it rebuilds from the database on the next request; it loses
no data and signs nobody out.

Once `CACHE_DRIVER=redis` is set, Redis is infrastructure the board
depends on at runtime. A request that cannot reach it fails rather than
silently serving stale data. Run Redis with `restart: unless-stopped`. It
needs no persistence configured: a restarted Redis is a cold cache, and a
cold cache is a slow minute, not an outage.

"Redis" here means the protocol. The server this project ships and
recommends is [Valkey](https://valkey.io), the Linux Foundation's
BSD-licensed fork, which is what the compose profile below runs. Plain
Redis, or any compatible server your host offers, works identically: point
`REDIS_URL` at it. The `redis` driver name names the protocol and stays
put whichever server answers it.

There is no Redis queue. `QUEUE_DRIVER` accepts `postgres` and `memory`,
and the Postgres queue is already safe under any number of workers.

## A board scaled from day one

Starting from the [by-hand route](../setting-up/deployment/docker-compose.md),
the differences are one service and three variables. In `.env`:

```ini
CACHE_DRIVER=redis
REDIS_URL=redis://redis:6379
```

The by-hand compose file already forwards both, and ships a `redis`
service behind a profile, named for the protocol and running Valkey:

```bash
docker compose --profile redis up -d --build
```

For the third variable, decide where uploads live before the board has
any: `FILESTORE_DRIVER=s3` with the `S3_*` companions if instances will
ever span machines, the shared `uploads` volume if they will not.

Then add web containers. Put the reverse proxy on the compose network and
route to `web:3000` rather than publishing a port, so nothing pins a host
port to a single container, then:

```bash
docker compose --profile redis up -d --scale web=3
```

The proxy needs no session affinity; round-robin is fine.
`TRUSTED_PROXY_HOPS` counts proxies in front of the board, and adding web
replicas behind the same proxy does not change it.

One worker remains enough at almost any size. Running two is safe but
rarely called for.

## Migrating a single-instance board

The path is the same on Coolify, plain Compose, or anything else that sets
environment variables. Redis should exist before the board is told to use
it. Nothing here touches the database, and every step is reversible.

**1. Run a Valkey server.** On Coolify, add a Valkey database resource to
the project (a Redis one works the same) and note its internal URL. On the
by-hand stack, `docker compose --profile redis up -d` starts the Valkey
service already defined; swap its image for `redis:7-alpine` if you
standardise on Redis proper. Anywhere else, any Valkey or Redis 7 works.

**2. Point the board at it.** Set on the **web and worker** services both:

```ini
CACHE_DRIVER=redis
REDIS_URL=redis://redis:6379
```

Substitute the URL from step 1; `rediss://` for a TLS endpoint. Giving the
worker the same cache lets a scheduled task or a demo reset invalidate
what the web instances are serving. Redeploy. The board is still
single-instance at this point, with its cache moved out of the process.
If boot fails naming `REDIS_URL`, the URL is missing or not a
`redis://`/`rediss://` string.

**3. Move uploads, if instances will span machines.** Set
`FILESTORE_DRIVER=s3` and the `S3_*` variables, and copy the existing
uploads across. The files under the uploads volume keep their keys, so a
`rclone` or `aws s3 sync` of the volume's contents into the bucket is the
whole job. Skip this step while every instance shares one machine and one
volume.

**4. Add instances.** On Coolify, raise the web service's replica count.
On Compose, the `--scale web=3` shape above. Then sign in on one instance,
change a setting in the control panel, and confirm another instance serves
the change immediately.

**Rolling back** is the reverse: scale web back to one, then optionally
unset `CACHE_DRIVER` and `REDIS_URL` and redeploy. The cache rebuilds
either way.

## The database under more instances

Each web process opens up to `DATABASE_POOL_MAX` connections (default 3),
and the count multiplies with instances: three replicas and a worker at
the default is twelve. On a managed database with a connection cap, either
lower `DATABASE_POOL_MAX` or put a transaction-mode pooler in front.
[Connection pooling](./operating.md#connection-pooling) explains the pooler
string and the `DIRECT_DATABASE_URL` companion that migrations need.

## Running the board on serverless functions

On a serverless platform an instance is created for a request, may be
frozen between requests, and is destroyed without warning; it has a
writable `/tmp` that nothing else can read and no background process of
its own. So there is exactly one supported driver set, the one where no
driver keeps anything in the instance:

| Driver | Value | Why nothing else works |
|---|---|---|
| `DATA_SOURCE` | `postgres` | `fixture` is a read-only sample board with no write side. |
| `QUEUE_DRIVER` | `postgres` | `memory` loses every queued job when the instance goes away, which is after almost every request. The environment already refuses it in production. |
| `CACHE_DRIVER` | `redis` | `next` and `memory` cache inside the process. With instances created and destroyed constantly, a per-process cache is close to no cache, and each one serves its own stale copy for up to a minute. |
| `FILESTORE_DRIVER` | `s3` or `blob` | `local` writes to a disk that no other instance can read and that is discarded with the instance. On Vercel the environment refuses it outright rather than losing uploads quietly. `s3` is any S3-compatible bucket and is the portable choice; `blob` is a Vercel Blob store, which costs no configuration on Vercel and cannot be read from anywhere else. |
| `MAIL_DRIVER` | `http` | Reaches the provider over ordinary HTTPS on 443, which is the one outbound path a function can rely on. |

There is no worker container here, so the platform's scheduler has to
drive the work by calling `/api/system/tick` with `TICK_SECRET` as a
bearer token. [Scheduled tasks](./operating.md#scheduled-tasks) covers the
call. Without it, mail sits in the queue and scheduled tasks never run.

### The environment

The full set for a board on functions, with an S3-compatible bucket and a
provider API for mail:

```
DATA_SOURCE=postgres
DATABASE_URL=postgres://…@pooler.…:6543/board   # transaction-mode pooler
DIRECT_DATABASE_URL=postgres://…@db.…:5432/board # session mode, for the two session locks

QUEUE_DRIVER=postgres
CACHE_DRIVER=redis
REDIS_URL=rediss://default:…@cache.…:6379

FILESTORE_DRIVER=s3
S3_BUCKET=board-uploads
S3_REGION=auto                                   # `auto` for R2; the real region for AWS
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_ENDPOINT=https://….r2.cloudflarestorage.com   # omit for AWS S3
S3_PUBLIC_BASE_URL=https://files.example         # where objects are *served* from
                                                 # …or, on Vercel only:
# FILESTORE_DRIVER=blob
# BLOB_STORE_ID=…                                # published by the Blob store itself

MAIL_DRIVER=http
MAIL_FROM=board@example.com
MAIL_HTTP_ENDPOINT=https://api.provider.example/emails
MAIL_HTTP_TOKEN=…

APP_URL=https://board.example
AUTH_SECRET=…                                    # 32+ characters of entropy
TICK_SECRET=…                                    # 32+ characters of entropy
```

`DATABASE_URL` is the pooled string and `DIRECT_DATABASE_URL` the direct
one: functions multiply connections faster than anything else (see
[the database under more instances](#the-database-under-more-instances)).

Serving the board is pooler-safe. It never holds a session open across
statements, never uses `LISTEN`/`NOTIFY`, and uses no named prepared
statements, so every ordinary request can go through a transaction-mode
pooler. **Migrations** and the **first-run installer** are not, because
they take a session-level advisory lock. A transaction-mode pooler hands
the server connection back when the locking statement commits: two
callers on different pooled backends can each be told they hold the lock,
and the lock outlives the caller, after which every later attempt is
refused and the installer reports itself permanently in flight.

So both run on `DIRECT_DATABASE_URL` when it is set and fall back to
`DATABASE_URL` when it is not, and each releases its lock explicitly with
`pg_advisory_unlock`. The rule: if `DATABASE_URL` points at a pooler, set
`DIRECT_DATABASE_URL` as well.

### What each driver does under a function

**Uploads, in a Vercel Blob store.** `FILESTORE_DRIVER=blob` needs one
variable, `BLOB_STORE_ID`, which a Blob store attached to the project
publishes itself. The SDK authenticates with the deployment's own OIDC
identity, so there is no token. Reaching the same store from *off* the
platform needs a read-write token you create yourself;
[Running on Vercel](../setting-up/deployment/vercel.md#how-the-blob-store-authenticates)
has the detail.

`@vercel/blob` is reached through a dynamic `import()`, so a board on any
other platform never evaluates it. It is still an ordinary dependency,
traced into the server bundle and inlined into the CLI and worker bundles
the same way `@aws-sdk/client-s3` is, and listed in
`serverExternalPackages` for that reason. An optional dependency would
trade a clear `ConfigurationError` for a raw `MODULE_NOT_FOUND`.

Objects are written with **private** access, so an object URL is not a
public link. Member content is served by the board through `files.get()`,
where permissions are checked. `signedUrl()` returns `undefined`, a
**deliberate omission rather than a limitation of the platform**: the SDK
can sign (`issueSignedToken()` then `presignUrl({ operation: 'get', … })`),
but `FileStore.url()` and `signedUrl()` have no callers outside the driver
contract, and the port permits declining. Should a caller ever want a
signed URL, this is the method to fill in. `url()` returns the store's own
object URL, which requires authentication that nothing asks for.

The catch is portability, and it is why `s3` stays the documented default
everywhere else. A Blob store is reachable only through Vercel's API: there
is no bucket to point `rclone` or `aws s3 sync` at, and deleting the Vercel
project deletes the attachments with it. So under `blob`, `meith backup`
carries the uploads **by default**; under `s3` it skips them, because a
bucket has its own backup story.
[Disaster recovery](./disaster-recovery.md#4-the-uploads-when-they-lived-elsewhere)
has the commands. Run one before you need it.

**Uploads, in an S3-compatible bucket.** The S3 client is built once per
instance and signs each request itself. `S3_ENDPOINT` switches it to
path-style addressing and turns off the flexible-checksum headers the AWS
SDK adds by default, which Cloudflare R2 rejects. The board sends no ACL
on a write, because R2 refuses requests that carry one, and uploads each
object in a single request rather than a multipart one. The whole file is
therefore held in the instance's memory while it is processed and sent, so
the function's memory limit, not the bucket, caps an upload's size.

Reading has the same ceiling. `FileStore.get()` hands back the whole
object as a `Uint8Array` and the download route buffers all of it before
it answers. An attachment uploaded on a larger function will exhaust a
smaller one on the way back down.

`PutFileOptions.visibility` is accepted and ignored: the board sends no
ACL, so an object is public only if the bucket it lands in is.

`S3_PUBLIC_BASE_URL` matters more here than on a server. R2 does not serve
objects from the API endpoint that `S3_ENDPOINT` points at; it serves them
from an `r2.dev` address or a custom domain. Set it to whichever of those
the bucket uses, or to a CDN in front of the bucket. Left unset with a
custom endpoint, the board falls back to path-style URLs against the API
endpoint, which works only for a store like MinIO that serves objects from
the same host it takes API calls on. It holds nothing secret, so
`meith env:check` prints it in full rather than redacting it alongside the
S3 credentials.

**Cache.** One Redis connection is opened per instance, lazily, on the
first cache read. A `rediss://` URL turns on TLS, which every managed
provider requires. Connections scale with *concurrent instances*: a
traffic spike that creates two hundred instances wants two hundred
connections, and a managed Redis plan with a connection cap will start
refusing them. Pick a plan whose cap is above the concurrency the board is
allowed to reach, or put a connection proxy in front. A dropped connection
reconnects on its own with exponential backoff.

**Queue.** Jobs live in Postgres and each is claimed by exactly one worker
through `FOR UPDATE SKIP LOCKED`, in a single statement that needs no
transaction held open across calls.

**Mail.** `http` posts the message as JSON to `MAIL_HTTP_ENDPOINT` with
`MAIL_HTTP_TOKEN` as a bearer token and gives up after ten seconds, which
fits inside a function's timeout. Prefer it. `smtp` can work, but it opens
a raw TCP connection on a port the platform may not allow out: 25 is
blocked everywhere and the environment refuses it on Vercel; 465 is often
blocked; 587 with `MAIL_SMTP_SECURITY=starttls` usually survives. A
connection is also negotiated from scratch for every message, which makes
each send slow.

**Images.** Attachment and avatar processing runs in WebAssembly, and the
`.wasm` files are loaded from `node_modules` at runtime. What keeps them
in a deployment is `serverExternalPackages` in
`apps/community/next.config.mjs`: the `@jsquash` packages are listed
there, so Next traces the packages whole and their `.wasm` files travel
with the build. Removing an entry would leave image handling working
locally and failing in production, so
`apps/community/src/server/wasm-tracing.test.ts` asserts every codec the
board loads is listed.

## How the cache stays coherent

Every global read the board caches goes through one cache driver, keyed
and tagged in one registry (`CacheTags`, in `@meith/core`). With
`CACHE_DRIVER=redis` the entries live in the shared store under those
keys, each tag holds the set of keys it covers, and invalidating a tag
deletes the covered entries in the store itself. The next read on **any**
instance misses, reloads from Postgres, and re-fills the shared store.
There is no per-instance copy to go stale. The sixty-second TTLs remain as
a backstop, and `packages/testkit/src/driver-contracts.test.ts` proves the
cross-instance behaviour against a real server on every CI run, spawning
`valkey-server` when the machine has one and `redis-server` otherwise.
