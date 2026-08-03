# ADR 0004 — `mysql2` for reading a MyBB board

**Status:** Accepted (2026-08-03). **Feature:** F85. **Resolves:** open question 5.

## The decision

`@forum/import` depends on `mysql2`, loaded dynamically inside
`MysqlMybbSource.connect()`.

## Why there was a question at all

The roadmap's working rules say to stop for a human before adding a runtime
dependency. F85 therefore shipped without one: the source **port**, a fixture
implementation, the mapping, the ordering, the chunking, the resumability, the
idempotency and the counter comparison — everything except the twenty lines that
connect to MySQL.

That was the right split. Every hard decision in an import is on the near side
of that port, and the acceptance criterion asks for a fixture round trip
precisely because a reader is `SELECT … WHERE pid > ? ORDER BY pid LIMIT ?`. But
an importer that cannot read a MyBB board does not import MyBB boards, so the
question had to be answered eventually.

## The alternatives, and why not them

**A `mysqldump` reader.** Genuinely attractive: no database dependency at all,
and it works against a board that has already been switched off — which is the
safer migration anyway, because nobody is posting into a moving target. It was
rejected because somebody has to write a MySQL dump parser, and a dump is not a
format so much as a pile of `INSERT` statements with escaping rules that differ
by server version and `sql_mode`. Parsing it badly loses rows silently, which is
the exact failure the rest of this feature is built to prevent. A driver has the
escaping already and has had it tested by everyone else.

**A separate tool writing through the REST API.** Keeps the dependency out of
this repository entirely. Rejected because an import would then run at HTTP
speed — two million posts through a rate-limited API is days, not minutes — and
because F81 has no write scopes, so the tool would need an API built for it
first.

## Why `mysql2` specifically

It is the maintained one, it speaks `caching_sha2_password` (MySQL 8's default,
which the older `mysql` package does not), and it has a promise interface so the
reader is not a callback adapter.

## What the dependency costs, and what bounds it

**It is loaded dynamically**, inside `connect()`. The app imports
`@forum/import` — F86's legacy URL table lives there — so a static import would
put a MySQL driver in the serverless bundle of every board, including the
overwhelming majority that will never import anything. A test asserts on the
source text that the only reference is `await import('mysql2/promise')`, because
the property is "no static import exists" and no runtime check can observe the
absence of one. A bundler can, which is why it matters.

**It is only reachable from the importer.** Nothing in the request path
constructs a `MysqlMybbSource`; the one caller is `forum import`.

## What the reader may do

Read. Every statement in the file is a `SELECT`, and a test asserts that — not
as ceremony, but because this code points at somebody's live production forum
while members are still posting to it. "We were careful" is not a guarantee;
"no statement in the file is anything but a select" is one that survives the
next edit.

Two smaller consequences of pointing at a live board:

- **Paging is keyset, never `OFFSET`.** The source is being written to during the
  migration, and an `OFFSET` walk over a growing table skips rows — in the
  middle, and without saying so.
- **The table prefix is validated, not trusted.** It becomes part of a table
  name and a table name cannot be a bound parameter, so it is the one
  caller-supplied value that reaches the SQL text. Anything but
  `[A-Za-z0-9_]{0,32}` is refused, which is the shape MyBB's own installer
  permits, so nothing legitimate is turned away.

The password is read from `MYBB_PASSWORD`, never a flag: a password in `argv` is
in the shell history and in `ps` output for every user on the machine.
