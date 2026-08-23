# Migrating from MyBB or phpBB

This is the procedure: what to do, in order, to move a MyBB or phpBB board
onto Meith with its members, content and old URLs intact. If you are
deciding *whether* your community will feel at home here rather than *how*
to run the move, read [MyBB parity decisions](./mybb-parity.md) instead —
it is the list of places Meith deliberately behaves differently, with the
reasoning and what an imported board loses. This page assumes you have
already made that call, or are migrating from phpBB, which has no
equivalent list because Meith was not built as a phpBB alternative first.

The importer is one command, run against the old board's database. It is
resumable — interrupt it or its budget runs out, run the same command
again, and it continues from where it stopped — and it is designed to be
rehearsed: point it at a copy of the old database as many times as you
like before you point it at the real one.

## Before you start

| You need | Because |
|---|---|
| A Meith board, already installed | The importer writes into `users`, `forums` and the rest of the live schema — run [Quickstart](./quickstart.md) or [Deploying by hand](./self-hosting.md) first, including the `/install` step, so the default groups and settings the importer relies on already exist. |
| Read access to the old board's MySQL or MariaDB database | Both sources connect over MySQL's wire protocol — a phpBB installed on PostgreSQL or SQLite is out of scope. A dedicated read-only account is worth creating; the importer never writes to the source. |
| The old board's uploads on disk, reachable from where you run the command | Attachments and avatars are copied as files, not rewritten as URLs. For MyBB, the board's `uploads/` directory; for phpBB, the installation root, so both `files/` and `images/avatars/` resolve underneath it. |
| A rehearsal copy of the old database | Restore a dump onto a throwaway MySQL instance and import into a throwaway Meith board first. This is the only way to see your board's actual skipped-row list and page-load feel before it matters. |

> [!IMPORTANT]
> Pick one source and stick with it. The importer's id map (used for
> resuming and for redirecting old URLs) keys rows by kind — `thread`,
> `post`, `user` and so on — not by source, so importing MyBB threads and
> then phpBB topics into the same board would have the second run's ids
> collide with the first's. Run the importer against one legacy board per
> Meith board.

## What comes across, and what does not

| Entity | MyBB | phpBB |
|---|---|---|
| Members, with working legacy passwords | yes | yes (bcrypt, phpass and phpBB2 MD5 hashes) |
| Forum tree | yes | yes |
| Threads and posts | yes | yes (bbcode uid markers and stored smiley/link markup cleaned) |
| Private messages | yes (each member's copy; drafts are not) | yes (one message with every recipient copy) |
| Attachments | yes | yes (post attachments; PM attachments are not) |
| Avatars | uploaded and gallery; remote URLs are not | uploaded and gallery; remote URLs are not |
| Thread and forum subscriptions | yes | yes |
| Polls, options and votes | yes, every vote in a multiple-choice poll included; `multiple` arrives as an unlimited choice count and `public` as a public voter list | yes, including `poll_max_options` as the choice count and `poll_vote_change` as re-voting |
| Reputation, with recomputed totals | yes | phpBB has none |
| Warnings, with recomputed points | yes, including expiry and revocation | minimal — phpBB stores no points, titles or expiry |
| Bans | yes (member moved to the banned group; expired bans lift on the next `bans.expire` run) | user bans; e-mail and IP bans are not |
| Buddy and ignore lists | yes | friends and foes |
| Legacy URL redirects | `showthread.php`, `forumdisplay.php`, `member.php` and rewritten routes | `viewtopic.php`, `viewforum.php`, `memberlist.php` |

**Not imported from either source, and what to do instead:**

| Left behind | Do this after the import |
|---|---|
| Group permission matrices | Rebuild your usergroups and forum permissions in `/admin` — a deliberate gap, not an oversight: MyBB's and phpBB's permission columns do not line up cleanly with Meith's (see [Permissions and groups](./mybb-parity.md#permissions-and-groups) if you are coming from MyBB), so a mechanical translation would produce permissions nobody chose. |
| Custom profile-field values | Recreate the fields with `community profile-field:add` (they start editable by every group; narrow that in `/admin` if you want the old restrictions). The values members typed are not imported — the field has to exist on this board before anybody can be asked to fill it in again. |
| Announcements | Re-post them — Meith's announcements are not threads (see [Announcements are not sticky threads](./mybb-parity.md#announcements-are-not-sticky-threads) for why), so there is no source row to map them from. |
| Smilies and custom BBCode/MyCode | Nothing to restore — Meith renders Markdown, not BBCode, and there is no admin-defined replacement-pattern equivalent. See [The markup language is Markdown, not BBCode](./mybb-parity.md#the-markup-language-is-markdown-not-bbcode) for exactly what survives the conversion and what does not. |
| Thread ratings | Not carried over; there is no equivalent to recreate them from. |
| Moderator logs | Historical only — Meith's own moderator log (`admin_log`) starts recording from the moment moderation happens on this board. |
| Per-member IP history | Neither `regip` nor `lastip` is imported; a migrated member's address history starts at their first sign-in here. |

## Run it

```sh
docker compose run --rm web community import --help
```

```sh
IMPORT_SOURCE_PASSWORD=… docker compose run --rm web community import \
  --source mybb --host db.old --user reader --database mybb \
  --uploads-dir /mnt/old-board/uploads
```

```sh
IMPORT_SOURCE_PASSWORD=… docker compose run --rm web community import \
  --source phpbb --host db.old --user reader --database phpbb \
  --prefix phpbb_ --uploads-dir /mnt/old-board
```

| Flag | Meaning | Default |
|---|---|---|
| `--source` | `mybb` or `phpbb` | `mybb` |
| `--host`, `--user`, `--database` | The old board's MySQL connection | required |
| `--port` | | `3306` |
| `--prefix` | The old board's table prefix | `mybb_`, or `phpbb_` for `--source phpbb` |
| `--charset` | | `utf8mb4` |
| `--ssl` | Connect over TLS | off |
| `--uploads-dir` | Path to the old board's files, described above | none — see below |
| `--page-size` | Rows fetched per database round trip | `200` |
| `--budget` | Rows read before this invocation stops and hands control back | `2000` |

The password is **never** a flag — set `IMPORT_SOURCE_PASSWORD` in the
environment instead (`MYBB_PASSWORD` still works, for scripts written
before phpBB support existed). A flag ends up in your shell history and in
`ps` for every other user on the box; an environment variable set inline on
the command, as above, does not.

### Without `--uploads-dir`

The importer still runs. Every attachment row is written marked failed,
with the legacy path recorded rather than a file; avatars are skipped
outright. Run the exact same command again, this time with
`--uploads-dir`, and the files are filled in — nothing about the run
before it needs redoing.

### Large boards, and stopping partway

`--budget` is not a safety limit to raise once and forget — it is what
makes one invocation predictable. A board with hundreds of thousands of
posts run with the default budget will print `Stopped after 2,000 rows
(the budget). Not an error — run the same command again to continue from
here.` and mean it literally: run the same command again, as many times as
it takes, or raise `--budget` to cover more of the board per invocation.
Interrupting the process (`Ctrl-C`, a container restart, a lost
connection) leaves it in the same resumable state — the last completed
page's progress is saved before the next one starts, so a run picks up
where it stopped rather than skipping or repeating a page.

### Rehearse, then cut over

Because the importer only ever reads rows past its saved cursor, running it
a second time against the *same* source picks up whatever is new since the
first run — new members, new posts, new everything with a higher id than
last time. What it will **not** pick up is a row it already imported that
was later edited on the old board: the cursor for that kind has moved past
it, so it is never read again.

That makes the practical sequence:

1. Rehearse against a copy of the old database until you trust the run.
2. When you are ready to actually move, put the old board into read-only
   mode (or take it offline) so nothing changes underneath the import.
3. Run the importer against the real database, to completion.
4. Point your domain at the new board.

Skipping step 2 does not corrupt anything — it just means a post edited on
the old board between your last import run and the cutover keeps its
pre-edit text here.

## After the import

```sh
docker compose run --rm web community task:run counters.reconcile
docker compose run --rm web community search:reindex
```

The first rebuilds post counts, thread counts, reputation totals and
warning points from the rows that now exist, rather than trusting numbers
carried over from the old board's own (possibly already drifted)
counters. The second builds the full-text index for the posts the import
just wrote — new posts get indexed as they are made, but ten thousand
imported ones did not go through that path.

Then, in `/admin/settings?group=board`, turn on **Redirect old forum
URLs** (`board.legacy_redirects`) — it defaults to **off**, on purpose:
turning it on before an import has actually run would answer every legacy
address with a 404 instead of nothing configured to try. With it on,
`showthread.php`, `forumdisplay.php` and `member.php` links (MyBB) or
`viewtopic.php`, `viewforum.php` and `memberlist.php` links (phpBB) —
including the rewritten route forms — permanently redirect to the
matching content here, so search engine results and old bookmarks keep
working.

Before you announce the move, check:

- **Sign in as a migrated member, using their old password.** The stored
  hash is your evidence the import worked, not a formality: Meith
  recognises the legacy MyBB or phpBB hash on that first sign-in, verifies
  the password against it, and silently replaces it with the board's own
  scheme — the member never sees a "reset your password" step, and every
  later sign-in uses the native hash.
- **Walk the forum tree and a few threads.** Structure, order and post
  content should all read the same as the old board.
- **Open an imported attachment and avatar**, if you ran with
  `--uploads-dir`. A broken image here means the uploads path was wrong,
  not that the import failed.
- **Follow an old thread link and an old member-profile link** and confirm
  they land on the new address, now that redirects are on.
- **Rebuild permissions**, add back any custom profile fields you need, and
  re-post announcements — the three things the table above says are on
  you, not the importer.

## Content conversion

MyBB posts are BBCode; Meith posts are Markdown. The importer does not
convert content at read time — every imported post, private message and
signature is rewritten once, in the background, the same way an
in-place upgrade converts an existing board's content. What survives the
conversion, what is degraded to plain text, and what phpBB's own BBCode
cleanup does before conversion, is documented in full — with the exact
list of tags — in
[The markup language is Markdown, not BBCode](./mybb-parity.md#the-markup-language-is-markdown-not-bbcode).
Read it before telling members what to expect; the short version is that
formatting (colour, size, underline) is lost and the words are not.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Unsafe legacy table prefix` | `--prefix` accepts only letters, digits and underscores — it is interpolated into a table name. Check what you typed against the old board's actual prefix. |
| `Set IMPORT_SOURCE_PASSWORD…` | The command refuses to start without the password in the environment; see above for why it is not a flag. |
| Every attachment and avatar skipped | No `--uploads-dir` was given, or it points at the wrong directory — the MyBB path is the board's `uploads/`; the phpBB path is the installation root, one level above `files/`. |
| `Stopped after N rows (the budget)` | Not an error. Run the same command again, or pass a larger `--budget`. |
| Connection refused, or times out | The database host is not reachable from wherever you run `docker compose run` — check that the old board's MySQL accepts connections from this network, not just from its own host. |
| A member cannot sign in with their old password | Check they are typing the password they used on the *old* board, not a new one they think they should have — a legacy hash that fails to verify is not rehashed, and the account still needs a normal password reset like any other failed sign-in. |

For everything about running the container stack itself — logs,
`docker compose ps`, mail and the worker — see
[Operations](./operating.md#troubleshooting).

## Next

| You want to | Read |
|---|---|
| Understand where this board deliberately differs from MyBB before you promise members a like-for-like move | [MyBB parity decisions](./mybb-parity.md) |
| Rebuild groups and forum permissions | [The organiser's guide](./organiser-guide.md) |
| Hand the approval queue and reports to your moderators | [The moderator's guide](./moderation-guide.md) |
| Run backups, upgrades and routine maintenance from here on | [Operations](./operating.md) |
