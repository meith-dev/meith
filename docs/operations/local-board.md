# Writable local board

Requires a [scaffolded board](../start/quickstart.md) and an empty PostgreSQL database.

## Configure

Stop the development server. In the board directory:

```sh
cp .env.example .env.local
openssl rand -hex 32
openssl rand -hex 32
```

Set `DATABASE_URL` in `.env.local`. Save the two different generated values as `AUTH_SECRET` and `TICK_SECRET`. Keep this file out of git. If the runtime URL uses a transaction pooler, also set a direct `DIRECT_DATABASE_URL`.

## Install

```sh
npm run meith -- env:check
npm run meith -- migrate
npm run dev
```

Open <http://localhost:3000/install>, unlock with `AUTH_SECRET`, enter board and administrator details, then finish. The installer closes afterward.

Create a thread and restart the server to verify persistence. If sample content remains, use `env:check` to confirm the resolved data source is `postgres`.

## Run background work

In another terminal in the board directory:

```sh
npm run meith -- task:list
npm run meith -- task:run
```

Production needs a continuing [scheduler](scheduled-tasks.md). The default log mail driver does not deliver mail; configure [email](mail.md) before requiring activation. Follow [Community setup](../administration/first-steps.md). Do not reset a database containing data you need.
