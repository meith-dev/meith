# Scaling out

One web container, one worker, one Postgres. That is the topology every
guide in this documentation sets up, and it is the right one for almost
every board — a forum is mostly reads, the reads are cached, and a single
modern container comfortably serves a community far larger than the club
the [Quickstart](./quickstart.md) was written for.

This page is for the board that has outgrown it, and for the operator who
wants more than one web container for resilience rather than load. The
short version: **set `CACHE_DRIVER=redis`, point `REDIS_URL` at a Redis
server, give uploads a store every instance can reach, and add web
containers.** Everything else already works.

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
wire protocol and nothing more, so [Valkey](https://valkey.io) — the
Linux Foundation's open-source, BSD-licensed fork — is a drop-in
replacement: point `REDIS_URL` at a Valkey server and nothing else
changes, including the driver name in the variable. The same goes for any
other compatible server your host already offers. If the licence politics
matter to your deployment, run Valkey; the board cannot tell the
difference, and this page reads the same either way.

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
service behind a profile:

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

**1. Run a Redis server.** On Coolify, add a Redis database resource to
the project and note the internal URL it gives you. On the by-hand stack,
`docker compose --profile redis up -d` starts the one already defined —
swap its image for `valkey/valkey:8-alpine` if you prefer the open-source
fork. Anywhere else, any Redis 7 or Valkey works.

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
whole job. Skip this step while every instance shares one machine and one
volume.

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
the default is twelve. A self-hosted Postgres 16 shrugs at that. On a
managed database with a connection cap, either lower `DATABASE_POOL_MAX`
or put a transaction-mode pooler in front —
[connection pooling](./operating.md#connection-pooling) explains the
pooler string and the `DIRECT_DATABASE_URL` companion that migrations
need.

## How the cache stays coherent

For the operator who wants to know what they are trusting: every global
read the board caches goes through one cache driver, keyed and tagged in
one registry (`CacheTags`, in `@meith/core`). With `CACHE_DRIVER=redis`
the entries live in Redis under those keys, each tag holds the set of
keys it covers, and invalidating a tag deletes the covered entries in
Redis itself — so the next read on **any** instance misses, reloads from
Postgres, and re-fills the shared store. There is no per-instance copy to
go stale and no broadcast to miss; coherence is a property of where the
data lives rather than of a message arriving. The sixty-second TTLs
remain as a backstop, and the contract suite in
`packages/testkit/src/driver-contracts.test.ts` proves the cross-instance
behaviour against a real Redis on every CI run.
