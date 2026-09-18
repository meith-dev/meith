# Import MyBB or phpBB

Import one legacy forum into an installed Meith board. Rehearse against a copy first. The importer reads the source and records progress in the destination; it is not a continuous synchronization service.

## Prepare the source and destination

You need an installed Meith board with its groups/settings, read-only access to a MySQL or MariaDB source, and the source uploads on the machine running the command. A phpBB database on another engine is outside this import path.

For MyBB, provide the old `uploads/` directory. For phpBB, provide the installation root so `files/` and `images/avatars/` are available. Keep untouched backups of the source database and files.

Use one legacy board per destination. The resume map is keyed by entity kind and old ID, not by source-board identity; importing several unrelated boards into one destination creates collisions.

Read [MyBB differences](mybb-parity.md) or [phpBB differences](phpbb-parity.md), then review the coverage below.

## Run a rehearsal

From a generated board checkout configured for the disposable Meith destination, provide `IMPORT_SOURCE_PASSWORD` through a protected environment or secret store. Run one of these, replacing host, database and file paths:

```sh
npm run meith -- import --source mybb --host db.old --user reader --database mybb --uploads-dir /path/to/old/uploads
```

```sh
npm run meith -- import --source phpbb --host db.old --user reader --database phpbb --prefix phpbb_ --uploads-dir /path/to/old-board
```

Use `npm run meith -- import --help` for optional port, TLS, charset, budget and page-size settings. In a container, explicitly pass the source credential into the container and mount the source files; a path or variable on the host is not automatically available inside it.

The default row budget is 2,000 per invocation. Run the same command again to resume until the report says it is complete. An interrupted run resumes from recorded progress.

Without `--uploads-dir`, attachment metadata can be imported while files remain failed and avatars are skipped. Repeat with the correct directory to copy the files; inspect the resulting report.

## Verify and prepare cutover

Check representative accounts, private forums, old/recent posts, polls, private messages, attachments and avatars. Review skipped rows and conversion losses.

Every imported account starts in the ordinary registered group, including former staff. Restore administrator access deliberately with `meith user:promote`, then rebuild groups, forum permissions and moderator appointments. Do this before opening the destination to members.

The resume cursor picks up later IDs; it does not reread already imported rows that were subsequently edited. For final cutover, stop writes on the source before the final import. Use an isolated rehearsal destination and a clean, controlled final import so earlier rehearsal data does not hide changed source rows.

## Finish the destination

Run with the destination board environment:

```sh
npm run meith -- task:run counters.reconcile
npm run meith -- search:reindex
```

Confirm scheduled work completes. Enable **Redirect old forum URLs** in Board settings only after a successful import. Check several old links and verify the destination permissions as guests and ordinary members.

Take a new backup, then switch DNS/proxy routing and invite members. Keep the source read-only and recoverable until the new board is verified.

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
| Group permission matrices | Rebuild your usergroups and forum permissions in `/admin` — a deliberate gap, not an oversight: MyBB's and phpBB's permission columns do not line up cleanly with Meith's (see [Permissions and groups](mybb-permissions.md#permissions-and-groups) if you are coming from MyBB), so a mechanical translation would produce permissions nobody chose. |
| Custom profile-field values | Recreate the fields with `meith profile-field:add` (they start editable by every group; narrow that in `/admin` if you want the old restrictions). The values members typed are not imported — the field has to exist on this board before anybody can be asked to fill it in again. |
| Announcements | Re-post them — Meith's announcements are not threads (see [Announcements are not sticky threads](mybb-content.md#announcements-are-not-sticky-threads) for why), so there is no source row to map them from. |
| Smilies and custom BBCode/MyCode | Nothing to restore — Meith renders Markdown, not BBCode, and there is no admin-defined replacement-pattern equivalent. See [The markup language is Markdown, not BBCode](mybb-content.md#the-markup-language-is-markdown-not-bbcode) for exactly what survives the conversion and what does not. |
| Thread ratings | Not carried over; there is no equivalent to recreate them from. |
| Moderator logs | Historical only — Meith's own moderator log (`admin_log`) starts recording from the moment moderation happens on this board. |
| Per-member IP history | Neither `regip` nor `lastip` is imported; a migrated member's address history starts at their first sign-in here. |
