# Quickstart

From an empty directory to a working board. About ten minutes, most of it
waiting for `npm install`.

**You need:** Node 22 or newer, and a Postgres database you can connect to.
Nothing else.

## 1. Create the project

```sh
npx create-meith my-board
cd my-board
npm install
```

You now have a normal Node project: your own `package.json`, a `forum.config.ts`
listing the installed theme and plugins, a `vercel.json` with the scheduled job
already wired, and a `.env.example`.

## 2. Point it at a database

```sh
cp .env.example .env.local
```

Fill in two values:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Your Postgres connection string. |
| `AUTH_SECRET` | A random 32-byte secret that signs sessions. |

Generate the secret:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> [!IMPORTANT]
> If your database is on a serverless platform such as Supabase or Neon, use the
> **transaction-mode pooler** connection string — on Supabase, port `6543`
> rather than `5432`. A board on the direct string works perfectly until it is
> busy, then starts refusing connections. See
> [connection pooling](./operating.md#connection-pooling).

## 3. Start it

```sh
npm run dev
```

Open <http://localhost:3000/install>.

## 4. Run the installer

The installer checks your environment before it offers you a form. Read that
report — nearly every way a new board fails is visible in it.

| It says | It means |
|---|---|
| **Blocker** | Installing cannot succeed. A missing variable, or the database is unreachable. |
| **Warning** | Installing will succeed and something will be wrong *later*. |

Then it runs five steps and names each one before it runs it:

1. **Apply migrations** — every table, index and seeded usergroup.
2. **Record the board's name** — the only setting it writes.
3. **Create the administrator** — your account.
4. **Create a first forum** — so the index is not empty.
5. **Disable the installer**.

> [!CAUTION]
> Step 5 is irreversible. `/install` answers 404 from then on, on purpose. Do not
> run the installer against a database you are not going to keep.

That is a board. Sign in and go to `/admin`.

## 5. Deploy it

The scaffold's `vercel.json` already schedules the background tick, so deploying
is a git push and three environment variables.

Set these on the platform **before** the first deploy:

| Variable | Why |
|---|---|
| `DATABASE_URL` | The pooler string. |
| `AUTH_SECRET` | Same as local, or a new one — changing it signs everyone out. |
| `TICK_SECRET` | Without it the scheduled job refuses every call, and nothing fails visibly. |

Then run the installer **from the deployed URL**, against the production
database.

> [!WARNING]
> Do not install production from your laptop. The installer seals itself when it
> finishes, and sealing it against a database you will not serve leaves you with a
> board that cannot be installed and an `/install` that 404s.

Self-hosting instead? Build the standalone Docker image, which runs the web
server, the worker and migrations from one image so the three cannot drift
apart. See [Running a board](./operating.md).

## 6. Configure mail before you invite anybody

> [!IMPORTANT]
> A board that has never had `MAIL_DRIVER` set **sends no mail at all**. The
> default writes each message to the server log and stops. Password reset fails
> silently, and if the activation method asks for a confirmation link, nobody can
> finish registering.

Two variables and one setting are all it takes:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@yourdomain.com   # must be on a domain verified with the provider
APP_URL=https://yourboard.example  # without it, links in mail cannot be built
```

Then check `registration.method` in `/admin/settings` — it decides whether new
members need a confirmation link at all. The full picture, including what to do
with another provider, is in
[Running a board § Mail](./operating.md#mail).

## If the install fails halfway

The run stops at the first failed step and names it, with the error. Later steps
are reported as *not run* rather than as further failures.

Sealing is deliberately last, so a failure before it leaves a board you can fix
and retry. What to do depends on how far it got:

- **It failed before the administrator was created.** Fix the cause and run it
  again. Migrations and the board-name setting are both safe to apply twice.
- **It failed after the administrator was created.** The installer will refuse to
  run again — its preflight blocks on *any* account existing, so a retry cannot
  add a second administrator to a board that already has members.

  If the board is genuinely yours to reset, recover at the database: restore the
  empty database, or drop and recreate it, and start again. If the only thing
  missing is administrator access on a board that otherwise works, do not
  reinstall — run `npm run forum -- user:promote`.

## Next

| You want to | Read |
|---|---|
| Run this board day to day | [Running a board](./operating.md) |
| Change how it looks | [The theme API](./theme-api.md) |
| Add behaviour | [The plugin API](./plugin-api.md) |
| Move a MyBB community here | [MyBB parity](./mybb-parity.md) |
