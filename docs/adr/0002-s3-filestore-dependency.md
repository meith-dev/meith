# ADR 0002 — S3FileStore needs a dependency decision

**Status:** Accepted (2026-07-30). Option A — `@aws-sdk/client-s3`, lazy-loaded.

## Context

F05 names `S3FileStore` as a *default* driver, and F42 (attachments) cannot ship
without it: `LocalFileStore` writes to disk, and invariant 19 forbids filesystem
writes outside `apps/cli` because serverless instances have no durable disk.

So the board cannot accept attachments on its primary target (Vercel) until an
object store exists. Everything else in F05 is done — the interfaces, env-based
selection, and a contract suite all four driver families now pass.

Invariant 2 says no new runtime dependency without an ADR, and the plan lists
"a feature needs a new runtime dependency" under **stop and ask a human**. This
is that stop.

## Options

### A — `@aws-sdk/client-s3`

The official client. Handles SigV4, retries, multipart, and every S3-compatible
provider (R2, B2, MinIO, Spaces).

- **For:** correct by default; signing and retry are someone else's problem;
  presigned URLs are one call, which F42 needs so a private attachment is not
  downloadable by direct URL.
- **Against:** large. The v3 client is modular but still pulls a substantial
  dependency tree into the server bundle, and it is the only heavyweight
  dependency the project would have.

### B — Hand-rolled SigV4 over `fetch`

S3's REST API is small: PUT, GET, DELETE, plus a presigned-URL construction.
SigV4 is ~100 lines using Web Crypto, which is already available in both
runtimes.

- **For:** no dependency; works unchanged on Edge; total control of the bundle.
- **Against:** it is **signing code**. A subtle bug does not fail loudly — it
  fails as an intermittent 403, or worse, as a presigned URL that grants more
  than intended. This is the category where "we wrote it ourselves" ages badly,
  and it would want its own test vectors against a real S3.

### C — Defer

Ship with `LocalFileStore` only. Attachments work self-hosted (Docker, with a
volume) and are unavailable on Vercel until this is resolved.

- **For:** no decision needed now; F42 is Phase 3, so there is time.
- **Against:** "deploys to Vercel in five minutes" is the project's headline
  claim, and a board that cannot accept an image attachment is not a forum most
  people would keep.

## Recommendation

**A**, with the caveat that the dependency is confined to
`packages/drivers/src/files/s3-file-store.ts` and reached only when
`FILESTORE_DRIVER=s3`, so a board on local storage never loads it — the same
lazy-require shape `container.ts` already uses for the Postgres branch.

The argument against B is not effort, it is blast radius: hand-rolled request
signing is a security-sensitive component whose failures are quiet, and this
project has been deliberate about not hand-rolling that class of thing (ADR 0001
took the same view on password hashing).

## Decision

**Option A.** `@aws-sdk/client-s3` is added as a runtime dependency of
`@forum/drivers`, confined to `src/files/s3-file-store.ts` and reached only when
`FILESTORE_DRIVER=s3`, via the same lazy-require shape `container.ts` uses for
the Postgres branch. A board on local storage never loads it.

Consequences to hold ourselves to:

- The import must stay lazy. A static top-level import would pull the client
  into every bundle, including boards that will never use S3 — which is the
  entire reason this was a decision rather than an obvious yes.
- `S3FileStore` must pass the F05 contract suite like every other driver.
- Presigned URLs are what F42 relies on so a private attachment is not
  downloadable by direct URL; that behaviour needs its own test, not just the
  contract's "either signs or admits it cannot".
