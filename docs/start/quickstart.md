# Local preview

Requires Node.js 22 or newer and npm. Run in your projects directory:

```sh
npx create-meith my-board
cd my-board
npm install
npm run dev
```

Open <http://localhost:3000>. Stop the server with Ctrl+C.

Without `DATABASE_URL`, Meith uses fixed sample data. The preview does not save posts, create accounts or provide writable plugin storage.

- To register and post, [connect a local database](../operations/local-board.md).
- To host a community, [choose a deployment](../operations/deployment.md).
- To change themes and plugins, see [Board configuration](../operations/configuration.md).
- To develop Meith itself, use the [source checkout](../contributing/development.md).
