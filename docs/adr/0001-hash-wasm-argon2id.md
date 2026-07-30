# ADR 0001 — hash-wasm for Argon2id password hashing

Status: accepted · Feature: F17 · Date: 2026-07-29

## Context

F17 requires Argon2id password hashing at `m=19456, t=2, p=1` with a timing-safe
verify and a legacy-hash upgrade seam. The runtime is Next.js on Node, and the
plan (§3/§4) names `hash-wasm` as the intended dependency, so this ADR records
*why* rather than re-opening the choice.

Candidates considered:

- **`argon2` (node-gyp native binding).** Fastest, but compiles native code at
  install and does not run on the Edge runtime. A native `.node` artefact also
  complicates the `output: "standalone"` Docker image (F04) and Vercel builds.
- **`@node-rs/argon2` (napi-rs).** Prebuilt binaries per platform/libc; better
  than node-gyp but still platform-specific artefacts and no Edge support.
- **`hash-wasm` (WASM).** Pure WebAssembly: one artefact, runs on Node and Edge
  identically, no compile step, no libc coupling. Slightly slower than native,
  which is irrelevant at `t=2` where the cost is dominated by the memory fill.

## Decision

Use `hash-wasm@4` (`argon2id`, `argon2Verify`) with `outputType: 'encoded'`.

The encoded output is a standard PHC string
(`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`). Two consequences we rely on:

1. **Verify is self-describing.** `argon2Verify({ password, hash })` reads the
   parameters back out of the encoded hash, so we never store `m/t/p` separately
   and can never verify against the wrong cost. The comparison is constant-time
   inside the WASM module.
2. **The upgrade seam is a parse.** `needsRehash()` parses the PHC parameters and
   returns true when they are weaker than the current policy (or the algorithm is
   not argon2id, i.e. a migrated legacy hash). Login re-hashes transparently on a
   successful verify. This is what lets `password_algo` migrate forward without a
   flag day.

Randomness comes from the Web Crypto global (`crypto.getRandomValues`), available
identically on Node 18+ and Edge — no `node:crypto` import, so the module stays
Edge-compatible.

## Consequences

- Session/credential tokens are hashed with SHA-256 (also `hash-wasm`), which is
  correct precisely because the token is already 256 bits of CSPRNG entropy —
  a slow KDF buys nothing against an un-guessable preimage, and the DB lookup is
  an indexed equality on the digest, not an attacker-timable comparison of the
  secret itself.
- The WASM module is initialised lazily on first hash. Cold-start cost is paid
  once per instance; verified acceptable for the auth path.
- If Edge support is ever dropped, revisit `@node-rs/argon2` for raw throughput.
