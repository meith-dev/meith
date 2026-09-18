# Try Meith locally

Create a local board with sample content. You need Node.js 22 or newer and npm. No database, hosting account or Docker installation is required for this preview.

## Create and start the preview

Run these commands in a terminal, in the directory where you keep projects:

```sh
npx create-meith my-board
cd my-board
npm install
npm run dev
```

Open <http://localhost:3000>. Browse the forums, threads, profiles and search screens. Stop the development server with Ctrl+C.

## Understand the sample data

Without `DATABASE_URL`, the board uses **fixture mode**: a fixed sample dataset for browsing and visual development. It does not save posts or provide a working installer, member accounts or plugin storage.

If you want to register, write posts or try moderation, continue with [Create a writable local board](../operations/local-board.md). If you want other people to use the community, [choose a deployment](../operations/deployment.md).

## Find your board files

`package.json` pins the engine and installed packages. `meith.config.ts` selects themes and plugins. `board.plugins.json` records plugin packages; `meith.plugins.ts` is its generated registry. The scaffold also includes deployment files.

[Board configuration](../operations/configuration.md) explains what belongs in code, environment variables and the admin panel.

To change Meith itself, use the separate [contributor setup](../contributing/development.md).
