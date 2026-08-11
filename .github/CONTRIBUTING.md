# Contributing

[docs/development.md](../docs/development.md) is the real document: running
the board on your machine, the workspace, the commands, and the invariant
scripts that fail on purpose. The short version:

```sh
pnpm install
pnpm dev          # a working board, no database needed
pnpm verify       # everything CI's static job runs — run it before a PR
```

A pull request is expected to pass `pnpm verify` and to keep the generated
documents current (`pnpm verify` says which one drifted and which command
regenerates it). Behaviour changes come with tests; the browser suite runs
with JavaScript disabled because that is the claim the board makes.

Releases are cut from tags by maintainers — [docs/release.md](../docs/release.md)
— so a contribution never needs to touch versions: `pnpm release:check` will
object if one sneaks in.
