# Meith

Open-source forum software for communities that want to run their own board.
Meith includes discussions, search, moderation, themes, and plugins, with most
reading and posting available without JavaScript.

[Website](https://www.meith.dev) · [Live demo](https://demo.meith.dev) ·
[Documentation](./docs/README.md) · [Issues](https://github.com/meith-dev/meith/issues)

## Try it locally

You need **Node.js 22 or newer**.

```sh
npx create-meith my-board
cd my-board
npm install
npm run dev
```

Open <http://localhost:3000>. This preview uses sample data and needs no
database or Docker. Saving posts requires PostgreSQL; the
[quickstart](./docs/getting-started/quickstart.md) explains the next step.

## Run a community

[Choose a deployment](./docs/getting-started/deployment/index.md): Coolify,
Docker Compose, or Vercel. After installation,
[set up your community](./docs/getting-started/first-steps.md).

Already running MyBB or phpBB? Start with the
[migration guide](./docs/guides/migrating.md).

## Contribute

To work on Meith itself, you need **Node.js 22 or newer** and **pnpm 10**.

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

The forum opens at <http://localhost:3000> with sample data. Read
[Development](./docs/contributing/development.md) for the workspace layout,
database setup, tests, and contribution workflow. Follow [AGENTS.md](./AGENTS.md)
and run `pnpm verify` and `pnpm comments:check` before submitting a pull request.

To build an extension for your own board, start with
[Write your first plugin](./docs/customization/first-plugin.md) or
[Theme development](./docs/customization/themes.md).

## Licence

[MIT](./LICENSE.md). Copyright © 2026 Jordan Harrison and the Meith contributors.
