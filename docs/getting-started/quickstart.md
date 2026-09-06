# Try Meith locally

You need Node.js 22 or newer. These commands create a local preview with
sample data; no database is required.

## Scaffold a board

```sh
npx create-meith my-board
cd my-board
npm install
npm run dev
```

Open <http://localhost:3000>. The generated directory contains your board's
[configuration files](../guides/configuration.md) and a deployment kit.

With no `DATABASE_URL` set, the dev server runs in **fixture mode**: the
board serves a realistic, deterministic dataset from memory — forums,
threads, members, search — so you can browse every screen and read every
page without PostgreSQL. Fixture mode deliberately does not fake writes;
the moment you want to post rather than look,
[point it at a database](../contributing/development.md#fixture-mode).

## Make it real

When the board should be reachable by more people than you:

- [Deployment](./deployment/index.md) — choose Coolify, Docker Compose, or Vercel.
- [Configuration in code](../guides/configuration.md) — what to commit,
  what stays in the admin panel.
- [Migrating](../guides/migrating.md) — if the community already lives on
  a MyBB or phpBB board, check import coverage and rehearse the move.

To work on Meith itself, use [Development](../contributing/development.md).
