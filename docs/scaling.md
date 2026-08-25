# Scaling out

One web container, one worker, one Postgres. That is the topology every
guide in this documentation sets up, and it is the right one for almost
every board — a forum is mostly reads, the reads are cached, and a single
modern container comfortably serves a far larger community than the one
the [Quickstart](./quickstart.md) was written for.

This page is for the board that has outgrown it, and for the operator who
wants more than one web container for resilience rather than load. The
short version: **set `CACHE_DRIVER=redis`, point `REDIS_URL` at a Valkey
or Redis server, give uploads a store every instance can reach, and add
web containers.** Everything else already works.

## What already scales

Most of the board's shared state lives in Postgres precisely so that any
process can serve any request:

| State | Where it lives | Scaling behaviour |
|---|---|---|
| Sessions and remember tokens | Postgres | Any instance can answer any request. No sticky sessions, ever. |
| Rate limits and login lockouts | Postgres | Counted once, board-wide, however many instances saw the attempts. |
| The job queue | Postgres (`FOR UPDATE SKIP LOCKED`) | Any number of workers; each job is claimed by exactly one. |
| Scheduled tasks (the tick) | Postgres | Claim-based. Concurrent ticks from several workers are safe — one claims the task, the rest move on. |

Two things do **not** scale by default, and both are configuration rather
than code:

- **The cache.** `CACHE_DRIVER=next` and `memory` hold the board's global
  reads — settings, navigation, the forum tree, word filters, smilies,
  group colours and theme overrides — in a map inside the process. Each
  entry carries a sixty-second backstop, so a change made through one
  instance reaches the others within a minute; until then every other
  instance serves the old value. A board can limp along like that. It
  should not: `CACHE_DRIVER=redis` makes the cache one shared store, and a
  change made anywhere is served everywhere from the next request.
- **Uploads.** `FILESTORE_DRIVER=local` writes to a disk, and a second
  instance on another machine has a different disk — an avatar uploaded
  through one instance would 404 from the other. Replicas on **one**
  machine may share the uploads volume; the moment instances span
  machines, switch to `FILESTORE_DRIVER=s3` — any S3-compatible bucket
  works, and [where uploads go](./operating.md#where-uploads-go) covers
  the variables.
- **Metrics.** `/api/metrics` (see [Monitoring & alerting](./monitoring.md))
  holds its counters and histograms in the process that answers the scrape,
  not in Postgres — every web instance and the worker is a separate scrape
  target with its own numbers. A Prometheus job with several targets sums
  them at query time; there is no board-wide total to read from any one of
  them.

## What Redis is, and is not, used for

Redis holds cache entries and nothing else. Sessions, posts, jobs, rate
limits — everything that would be a loss — stay in Postgres. Losing the
Redis server costs the board a warm cache, which it rebuilds from the
database on the next request; it loses no data and signs nobody out.

Be equally clear about the other direction: once `CACHE_DRIVER=redis` is
set, Redis is infrastructure the board depends on at runtime. A request
that cannot reach it fails rather than silently serving stale data, the
same way a request that cannot reach Postgres fails. Run Redis with
`restart: unless-stopped` and treat it as part of the board, not an
accessory. It needs no persistence configured — a restarted Redis is a
cold cache, and a cold cache is a slow minute, not an outage.

"Redis" here means the protocol, not the company. The board speaks the
wire protocol and nothing more, and the server this project ships and
recommends is [Valkey](https://valkey.io) — the Linux Foundation's
open-source, BSD-licensed fork — which is what the compose profile below
runs. Plain Redis, or any other compatible server your host already
offers, works identically: point `REDIS_URL` at it and nothing else
changes, including the `redis` driver name in the variable, which names
the protocol and stays put whichever server answers it.

There is no Redis queue. `QUEUE_DRIVER` accepts `postgres` and `memory`,
and the Postgres queue is already safe under any number of workers — a
second queue technology would add an operational dependency without
adding a capability.

## A board scaled from day one

Starting from the [by-hand route](./self-hosting.md), the differences are
one service and three variables. In `docker/.env`:

```ini
CACHE_DRIVER=redis
REDIS_URL=redis://redis:6379
```

The stock `docker/compose.yml` already forwards both, and ships a `redis`
service behind a profile — named for the protocol, running Valkey:

```bash
docker compose --profile redis up -d --build
```

For the third variable, decide where uploads live before the board has
any: `FILESTORE_DRIVER=s3` with the `S3_*` companions if instances will
ever span machines, the shared `uploads` volume if they will not.

Then add web containers. Compose can run several from the same
definition once nothing pins a host port to a single container — put the
reverse proxy on the compose network and route to `web:3000` rather than
publishing a port, then:

```bash
docker compose --profile redis up -d --scale web=3
```

The proxy needs no session affinity; round-robin is fine. Keep
`TRUSTED_PROXY_HOPS` honest — the count is proxies in front of the board,
and adding web replicas behind the same proxy does not change it.

One worker remains enough at almost any size — its work is queue drains
and housekeeping, not requests. Running two is safe (see the table above)
but rarely called for.

## Migrating a single-instance board

The path is the same whether the board runs on Coolify, plain Compose, or
anything else that sets environment variables. The order matters only in
that Redis should exist before the board is told to use it. Nothing here
touches the database, and every step is reversible.

**1. Run a Valkey server.** On Coolify, add a Valkey database resource
to the project (a Redis one works the same) and note the internal URL it
gives you. On the by-hand stack, `docker compose --profile redis up -d`
starts the Valkey service already defined — swap its image for
`redis:7-alpine` if your organisation standardises on Redis proper.
Anywhere else, any Valkey or Redis 7 works.

**2. Point the board at it.** Set on the **web and worker** services both:

```ini
CACHE_DRIVER=redis
REDIS_URL=redis://redis:6379
```

(Substitute the URL from step 1; `rediss://` for a TLS endpoint.) Giving
the worker the same cache matters — it is what lets a scheduled task or a
demo reset invalidate what the web instances are serving. Redeploy. The
board is still single-instance at this point; it has simply moved its
cache out of the process, which is the whole migration risk, taken while
there is still only one instance to watch. If boot fails naming
`REDIS_URL`, the URL is missing or not a `redis://`/`rediss://` string.

**3. Move uploads, if instances will span machines.** Set
`FILESTORE_DRIVER=s3` and the `S3_*` variables, and copy the existing
uploads across — the files under the uploads volume keep their keys, so a
`rclone` or `aws s3 sync` of the volume's contents into the bucket is the
whole job;
[moving a board from local disk to S3](./operating.md#moving-a-board-from-local-disk-to-s3)
is the step-by-step. Skip this step while every instance shares one
machine and one volume.

**4. Add instances.** On Coolify, raise the web service's replica count.
On Compose, the `--scale web=3` shape above. Watch the board for a
minute: sign in on one instance, change a setting in the control panel,
and confirm another instance serves the change immediately — that
round-trip exercises the whole of what this page sets up.

**Rolling back** is the reverse: scale web back to one, then (optionally)
unset `CACHE_DRIVER` and `REDIS_URL` and redeploy. The cache rebuilds
either way; nothing is migrated in a way that needs migrating back.

## The database under more instances

Each web process opens up to `DATABASE_POOL_MAX` connections (default 3),
and the count multiplies with instances: three replicas and a worker at
the default is twelve. A self-hosted Postgres 18 shrugs at that. On a
managed database with a connection cap, either lower `DATABASE_POOL_MAX`
or put a transaction-mode pooler in front —
[connection pooling](./operating.md#connection-pooling) explains the
pooler string and the `DIRECT_DATABASE_URL` companion that migrations
need.

## Running the board on serverless functions

A serverless platform is this page taken to its limit. Every rule above —
hold no state in the process, put nothing on the local disk, let any
instance answer any request — stops being advice and becomes the only way
the board runs at all. An instance is created for a request, may be frozen
between requests, and is destroyed without warning; it has a writable
`/tmp` that nothing else can read and no background process of its own.

So there is exactly one supported driver set, and it is the one where no
driver keeps anything in the instance:

| Driver | Value | Why nothing else works |
|---|---|---|
| `DATA_SOURCE` | `postgres` | `fixture` is a read-only sample board with no write side. |
| `QUEUE_DRIVER` | `postgres` | `memory` loses every queued job when the instance goes away, which is after almost every request. The environment already refuses it in production. |
| `CACHE_DRIVER` | `redis` | `next` and `memory` cache inside the process. With instances created and destroyed constantly, a per-process cache is close to no cache, and each one serves its own stale copy for up to a minute. |
| `FILESTORE_DRIVER` | `s3` | `local` writes to a disk that no other instance can read and that is discarded with the instance. On Vercel the environment refuses it outright rather than losing uploads quietly. |
| `MAIL_DRIVER` | `http` | Reaches the provider over ordinary HTTPS on 443, which is the one outbound path a function can rely on. |

Nothing runs the queue on its own. There is no worker container here, so
the scheduled work a worker would do has to be driven from outside by the
platform's scheduler, calling `/api/system/tick` with `TICK_SECRET` as a
bearer token — [scheduled tasks](./operating.md#scheduled-tasks) covers
the call. Without it, mail sits in the queue and scheduled tasks never
run.

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

MAIL_DRIVER=http
MAIL_FROM=board@example.com
MAIL_HTTP_ENDPOINT=https://api.provider.example/emails
MAIL_HTTP_TOKEN=…

APP_URL=https://board.example
AUTH_SECRET=…                                    # 32+ characters of entropy
TICK_SECRET=…                                    # 32+ characters of entropy
```

`DATABASE_URL` is the pooled string and `DIRECT_DATABASE_URL` the direct
one, for the reason [the database under more
instances](#the-database-under-more-instances) gives: functions multiply
connections faster than anything else.

Serving the board is pooler-safe. It never holds a session open across
statements, never uses `LISTEN`/`NOTIFY`, and asks the driver for no
named prepared statements, so every ordinary request can go through a
transaction-mode pooler.

Two things are not, and they are the two that take a session-level
advisory lock: **migrations** and the **first-run installer**. A
transaction-mode pooler hands the server connection back to the pool when
the statement that took the lock commits, which breaks such a lock twice
over. Two callers on different pooled backends can each be told they hold
it, so the mutual exclusion it exists to provide is gone; and the lock
outlives the caller, because closing a pooled client ends the client side
only and leaves a backend still holding it — after which every later
attempt is refused and the installer reports itself permanently in
flight.

So both run on `DIRECT_DATABASE_URL` when it is set and fall back to
`DATABASE_URL` when it is not, which is the right answer for a
self-hosted board whose single string is already a direct connection.
Each also releases its lock explicitly with `pg_advisory_unlock` rather
than trusting the connection's end to do it. The rule for an operator is
simply: if `DATABASE_URL` points at a pooler, set `DIRECT_DATABASE_URL`
as well.

### What each driver does under a function

**Uploads.** The S3 client is built once per instance and signs each
request itself, so there is no connection to keep warm. `S3_ENDPOINT`
switches it to path-style addressing for anything S3-compatible and turns
off the flexible-checksum headers the AWS SDK adds by default, which
Cloudflare R2 rejects. The board sends no ACL on a write — R2 refuses
requests that carry one — and uploads each object in a single request
rather than a multipart one, so the object never has to be assembled from
parts. That last point has a cost worth knowing: the whole file is held in
the instance's memory while it is processed and sent, so the function's
memory limit, not the bucket, is what caps an upload's size.

Reading has the same ceiling. `FileStore.get()` hands back the whole
object as a `Uint8Array` and the download route buffers all of it before
it answers, so nothing is streamed on the way out either. A file small
enough to upload is small enough to serve, but the memory limit is what
decides both, and an attachment that was uploaded on a larger function
will exhaust a smaller one on the way back down.

`PutFileOptions.visibility` is accepted and ignored: the board sends no
ACL, so an object is public only if the bucket it lands in is. Serving
uploads from a public bucket is a decision made on the bucket, not per
file.

`S3_PUBLIC_BASE_URL` matters more here than on a server. R2 does not serve
objects from the API endpoint that `S3_ENDPOINT` points at; it serves them
from an `r2.dev` address or a custom domain. Set it to whichever of those
the bucket uses, or to a CDN in front of the bucket, and public URLs will
point somewhere a browser can actually fetch. Left unset with a custom
endpoint, the board falls back to path-style URLs against the API endpoint
— correct in shape, and correct in practice only for a store like MinIO
that serves objects from the same host it takes API calls on. It holds
nothing secret, so `forum env` prints it in full rather than redacting it
alongside the S3 credentials.

**Cache.** One Redis connection is opened per instance, lazily, on the
first cache read — not one per request. A `rediss://` URL turns on TLS,
which every managed provider requires. The consequence to plan for is that
connections scale with *concurrent instances*, and the platform decides
how many of those exist: a traffic spike that creates two hundred
instances wants two hundred connections, and a managed Redis plan with a
connection cap will start refusing them. Pick a plan whose cap is above
the concurrency the board is allowed to reach, or put a connection proxy
in front. A dropped connection reconnects on its own with exponential
backoff, so an instance that was frozen and thawed recovers without
intervention.

**Queue.** Jobs live in Postgres and each is claimed by exactly one
worker through `FOR UPDATE SKIP LOCKED`, in a single statement that needs
no transaction held open across calls. Enqueuing from one instance and
claiming from another is the normal case rather than an edge one.

**Mail.** `http` posts the message as JSON to `MAIL_HTTP_ENDPOINT` with
`MAIL_HTTP_TOKEN` as a bearer token and gives up after ten seconds, which
fits inside a function's timeout. Prefer it. `smtp` can work, but it opens
a raw TCP connection on a port the platform may not allow out: 25 is
blocked everywhere and the environment refuses it on Vercel; 465 is often
blocked; 587 with `MAIL_SMTP_SECURITY=starttls` is the one that usually
survives. A connection is also negotiated from scratch for every message,
because there is no long-lived process to pool one in, which makes each
send slow in a place where slow costs money.

**Images.** Attachment and avatar processing runs in WebAssembly, and the
`.wasm` files are loaded from `node_modules` at runtime rather than
imported. What keeps them in a deployment is `serverExternalPackages` in
`apps/community/next.config.mjs`: the `@jsquash` packages are listed
there, so Next traces the packages whole and their `.wasm` files travel
with the build. Removing one of those entries would leave image handling
working locally and failing in production, which is why
`apps/community/src/server/wasm-tracing.test.ts` asserts every codec the
board loads is listed.

## How the cache stays coherent

For the operator who wants to know what they are trusting: every global
read the board caches goes through one cache driver, keyed and tagged in
one registry (`CacheTags`, in `@meith/core`). With `CACHE_DRIVER=redis`
the entries live in the shared store under those keys, each tag holds the
set of keys it covers, and invalidating a tag deletes the covered entries
in the store itself — so the next read on **any** instance misses, reloads from
Postgres, and re-fills the shared store. There is no per-instance copy to
go stale and no broadcast to miss; coherence is a property of where the
data lives rather than of a message arriving. The sixty-second TTLs
remain as a backstop, and the contract suite in
`packages/testkit/src/driver-contracts.test.ts` proves the cross-instance
behaviour against a real protocol-speaking server on every CI run — it
spawns `valkey-server` when the machine has one, `redis-server` otherwise.
