# ADR 0003 — @jsquash for decoding and re-encoding uploaded images

**Status:** Accepted (2026-08-02). **Feature:** F42, and F58's avatar half
behind it.

## Context

F42 requires "magic-byte/type/quota checks, re-encoded images, async
thumbnails". The re-encode is not decoration:

**Validation cannot make an upload safe; re-encoding can.** Checking magic bytes
tells you a file *claims* to be a PNG. It says nothing about the ZIP appended
after the `IEND` chunk, the EXIF block carrying an exploit for whichever
decoder eventually opens it, or the GIF/JavaScript polyglot that is a valid
image and a valid script. Every one of those survives validation, because the
file genuinely is a valid image. None of them survives a decode to raw pixels
followed by an encode from those pixels — the output is written by the encoder
and has never seen the original bytes.

Thumbnails need the same machinery, and so does F58's avatar, which the plan
already records as blocked on this decision (D61): a remote avatar URL rendered
directly is a tracking beacon, and fetched server-side it is SSRF, so both
mitigations end at *validate, fetch, re-encode, store* — which is this.

Invariant 2 says no new runtime dependency without an ADR. This is that stop,
and it is the one `progress.md` has named as needing a human since Phase 3.

## Options

### A — `sharp`

The default choice for Node image processing. Fast, complete, well-maintained.

- **For:** by far the best performance; handles every format; battle-tested;
  already present in this tree as an optional transitive of Next's image
  optimiser.
- **Against:** it is **libvips with prebuilt native binaries per platform and
  libc**. That is exactly the artefact class ADR 0001 rejected for Argon2id, for
  reasons that have not changed: it complicates the `output: "standalone"`
  Docker image (F04), it is per-platform, and a musl/glibc mismatch fails at
  runtime rather than at install. Its presence as a Next transitive is not a
  licence to depend on it — depending on a package we did not declare is how a
  board breaks when Next drops it.

### B — `@jsquash/{png,jpeg,resize}`

The Squoosh codecs (libpng, mozjpeg) compiled to WebAssembly, packaged for
direct use.

- **For:** pure WebAssembly — one artefact, no compile step, no libc coupling,
  no per-platform binaries. The same reasoning that chose `hash-wasm` in ADR
  0001. mozjpeg specifically is a *better encoder* than libjpeg-turbo for
  attachment-sized images. Decoders are the ones running on hostile input, and
  running them inside the WASM sandbox is a real containment boundary that a
  native binding does not have.
- **Against:** slower than native — measured at roughly 4-6× for an encode,
  which matters only if this runs inline in a request. Three packages rather
  than one. And the packaging is browser-first: the `.wasm` is loaded with
  `fetch(new URL(…, import.meta.url))`, which does not work on a Node server at
  all (see below).

### C — Pure-JS codecs (`pngjs`, `jpeg-js`)

- **For:** no WASM, no native code, small.
- **Against:** `jpeg-js` is an order of magnitude slower and its encoder is
  poor; neither has had the fuzzing attention libpng and mozjpeg have. This is
  decoder code on attacker-supplied input, which is the last place to take an
  unaudited implementation to save a dependency.

### D — Do not re-encode; validate and store the original

- **For:** no dependency at all.
- **Against:** this is the option the Context rules out. It would ship a board
  that serves attacker-controlled bytes under its own origin, having checked
  only that the first eight of them look like a PNG.

## Decision

**Option B.** `@jsquash/png`, `@jsquash/jpeg` and `@jsquash/resize` become
runtime dependencies of `@forum/drivers`.

The performance argument for `sharp` is real and is answered by *where* this
runs, not by making it faster: image work belongs off the request path
regardless of codec, and F42's "async thumbnails" already says so. A 400ms
mozjpeg encode in a queued job is not a user-visible cost; the same 80ms encode
inline in a route handler still blocks the event loop of a serverless function.

Confinement, as with ADR 0002:

- The codecs live behind their **own entry point**, `@forum/drivers/images`, and
  are deliberately *not* re-exported from the `@forum/drivers` barrel. Every
  route on the board imports that barrel to get a `FileStore`; putting ~630 KB
  of WebAssembly in it would make "a board that never accepts an image never
  compiles a codec" a slogan rather than a fact.
- `serverExternalPackages` lists all three, for the reason the Amendment to ADR
  0002 established — a lazy `require()` keeps nothing out of a bundle — and for
  a second reason specific to WASM, below.

## The packaging problem, and why the loader is ours

This is the part that cost the most and is the most likely thing to break on an
upgrade, so it is recorded in full.

`@jsquash/*` load their own `.wasm` with
`fetch(new URL('….wasm', import.meta.url))`. **There is no configuration in
which that works on this board:**

- **Unbundled**, `import.meta.url` is a real `file:` URL, and Node's `fetch`
  refuses `file:` — `TypeError: fetch failed`, cause `not implemented... yet...`.
- **Bundled**, `import.meta.url` inside a Turbopack server chunk is the literal
  string `"unknown"`, so nothing can be resolved relative to it.

So `codec.ts` never lets a codec initialise itself. It reads the `.wasm` off
disk, compiles it, and passes the module to each package's `init()` — including
`@jsquash/resize`'s `initResize`, which is easy to miss because `resize()` will
otherwise initialise itself lazily through the failing path, and is therefore
silent until the first thumbnail.

Finding the file is `locate-wasm.ts`. It tries `createRequire` first, which is
correct wherever this module is a real file (vitest, `tsx`, the esbuild-bundled
worker, the CLI). Where that is unavailable it walks up from the working
directory looking under `node_modules/` **and** under
`node_modules/.pnpm/<name>@<version>/node_modules/`, because the Next standalone
output's `node_modules` contains `.pnpm` and *nothing else* — no top-level links
at all, so no bare specifier resolves from it by any means, Node's own included.

`serverExternalPackages` is load-bearing for this: the tracer copies an external
package's directory whole, `.wasm` included. Bundled instead, the `.wasm` would
never be traced and the standalone image could not decode anything.

**This was verified by booting the standalone image**, not by reasoning about
it: a route that encodes a PNG, decodes it, resizes it and encodes a JPEG
answers with all four modules resolved under `.pnpm`. Three earlier attempts
passed every test and failed there, which is the shape of bug D54 exists to
record.

## Consequences to hold ourselves to

- **`codec.ts` has no fallback and must not grow one.** "Try our loader, fall
  back to the package's" passes its tests and then answers `fetch failed` in
  production. A resolution failure throws, naming the file it wanted.
- **The `.wasm` paths are hard-coded strings** (`codec/pkg/squoosh_png_bg.wasm`
  and friends) and a version bump can move them. `locate-wasm.test.ts` compiles
  all four from the *installed* packages for exactly this reason: an upgrade
  that moves a file fails a test rather than a deployment.
- **PNG and JPEG only.** WebP and AVIF are further `@jsquash` packages and more
  WASM; GIF is not supported at all, and an animated GIF re-encoded to a still
  frame is worse than a refusal. What the board accepts is what it can
  re-encode, and it says so.
- **Nothing decodes an image on the request path.** Uploads are validated
  synchronously and processed by a queued job. This is what makes the
  performance gap against `sharp` a non-issue, and it is a condition of this
  decision rather than an implementation detail.
- **`sharp`'s presence in the tree is a coincidence and stays one.** It is a
  transitive of Next's image optimiser and is not declared, imported, or relied
  on anywhere.
