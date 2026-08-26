# Quickstart

A Meith board running on your machine, in about a minute, with nothing
installed but Node.js 22 or newer. No database, no Docker, no account
with anybody.

## Scaffold a board

```sh
npx create-meith my-board
cd my-board
npm install
npm run dev
```

Open <http://localhost:3000>. That is a board of your own: a workspace
that pins the engine at one exact version in `package.json`, with
[the config files](../guides/configuration.md) that decide its themes
and plugins, a Dockerfile, and a compose file for when it goes to a
server. The same scaffold comes from
`curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board`
if you would rather not go through npm.

With no `DATABASE_URL` set, the dev server runs in **fixture mode**: the
board serves a realistic, deterministic dataset from memory — forums,
threads, members, search — so you can browse every screen and read every
page without PostgreSQL. Fixture mode deliberately does not fake writes;
the moment you want to post rather than look,
[point it at a database](../contributing/development.md#fixture-mode).

## Or run the engine itself

Working on Meith rather than on a board? Clone the repository and the
same fixture-mode start applies to the whole workspace:

```sh
git clone https://github.com/meith-dev/meith
cd meith
pnpm install
pnpm dev
```

[Development](../contributing/development.md) covers the Postgres-backed
setup, the tests, and what `pnpm verify` checks before a pull request.

## Make it real

When the board should be reachable by more people than you:

- [Deployment](./deployment/index.md) — the production shape and three
  routes onto your own server, from a guided panel to a compose file.
- [Configuration in code](../guides/configuration.md) — what to commit,
  what stays in the admin panel.
- [Migrating](../guides/migrating.md) — if the community already lives on
  a MyBB or phpBB board, bring it across whole instead of starting empty.
