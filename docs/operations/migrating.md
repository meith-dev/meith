# Import MyBB or phpBB

Import into an installed Meith board using read-only MySQL/MariaDB source access. Rehearse in an isolated destination first. The importer is resumable, not continuous synchronisation.

## Prepare

Keep source database and file backups. For MyBB, provide `uploads/`; for phpBB, provide the installation root containing `files/` and `images/avatars/`.

Use one source board per destination. Progress keys contain entity kind and old ID, not source identity; unrelated boards collide.

## Run

In a generated board checkout configured for the destination, supply `IMPORT_SOURCE_PASSWORD` through protected environment configuration:

```sh
npm run meith -- import --source mybb --host db.old --user reader --database mybb --uploads-dir /path/to/old/uploads
```

For phpBB:

```sh
npm run meith -- import --source phpbb --host db.old --user reader --database phpbb --prefix phpbb_ --uploads-dir /path/to/old-board
```

Use `import --help` for port, TLS, charset, budget and page size. Containers need the credential explicitly passed and source files mounted.

The default budget is 2,000 rows per invocation. Repeat the same command until the report says complete. Without uploads, attachment files fail and avatars are skipped; rerun with the correct directory and inspect results.

## Coverage

| Data | MyBB | phpBB |
|---|---|---|
| Accounts/passwords | Legacy passwords supported | bcrypt, phpass and phpBB2 MD5 supported |
| Forums, threads, posts | Imported | Imported; BBCode UID and stored smiley/link markup cleaned |
| Private messages | Participant copies; no drafts | Shared message plus recipient copies |
| Attachments | Supported files | Post attachments only; no PM attachments |
| Avatars | Uploaded/gallery; no remote URLs | Uploaded/gallery; no remote URLs |
| Subscriptions | Thread and forum | Thread and forum |
| Polls | Options/votes; multiple becomes unlimited, public flag retained | Options/votes, choice cap and vote-change flag |
| Reputation | Imported and totals recomputed | No source equivalent |
| Warnings | Expiry/revocation; points recomputed | Limited source details |
| Bans | Member bans; expiry through scheduled task | User bans; no email/IP exclusions |
| Contacts | Buddies/ignore | Friends/foes |
| Legacy URLs | MyBB original and rewritten routes | Topic, forum and member routes |

Group ACLs, custom profile values, custom markup definitions, thread ratings, moderator logs and IP history do not transfer. Rebuild permissions and fields; review [MyBB](mybb-parity.md) or [phpBB](phpbb-parity.md) differences. Recreate MyBB announcements. phpBB announcements become sticky threads.

## Cut over

1. Review skipped rows, converted text, messages, polls and files.
2. Restore staff access deliberately with `meith user:promote`. Imported accounts start without source staff privileges; rebuild groups, permissions and appointments.
3. Stop source writes before the final import. Resume only reads later IDs, not edits to already-imported rows; use a clean final destination rather than the rehearsal database.
4. Reconcile and index:

```sh
npm run meith -- task:run counters.reconcile
npm run meith -- search:reindex
```

5. Test guest/member/private-forum access. Enable **Redirect old forum URLs** and test old links.
6. Take a new backup, switch routing and retain the read-only source until verified.
