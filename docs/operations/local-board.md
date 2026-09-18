# Create a writable local board

Turn a scaffolded preview into a board where you can register, post and use the admin panel. You need the board from the quickstart and access to an empty PostgreSQL database. This is a development setup; use a deployment guide for a public community.

## 1. Configure the database

In your board directory, stop the development server and copy the supplied environment example:

```sh
cp .env.example .env.local
```

Set `DATABASE_URL` to your PostgreSQL connection string. Generate two different secrets:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Save them as `AUTH_SECRET` and `TICK_SECRET` in `.env.local`. Leave secrets out of git. With a database URL present, Meith selects the PostgreSQL data source.

If the database provider supplies a transaction-pooler URL and a direct URL, use the pooler for `DATABASE_URL` and the direct one for `DIRECT_DATABASE_URL`. See [Database connections](database-operations.md).

## 2. Apply migrations and start

From the board directory:

```sh
npm run meith -- env:check
npm run meith -- migrate
npm run dev
```

Open <http://localhost:3000/install>. Unlock the installer with `AUTH_SECRET`, enter the board and administrator details, and finish installation. The installer closes after a successful installation.

## 3. Check that changes persist

Sign in, create a thread, restart the development server and open the thread again. It should still be present. If the board still shows only sample content, run `env:check` and confirm that it loaded your board's environment file and selected `postgres`.

Use [Set up your community](../administration/first-steps.md) to configure registration, permissions and mail. The default log mail driver records messages locally; it does not deliver email.

## 4. Exercise background work

In another terminal, from the same board directory, run:

```sh
npm run meith -- task:list
npm run meith -- task:run
```

A manual run is useful during development. A deployed community needs a continuously running worker or an external scheduler; follow [Scheduled tasks](scheduled-tasks.md).

Do not delete or reset a database to fix an installer problem if it contains data you want to keep. Use [Backups](backups.md) before replacing a database.
