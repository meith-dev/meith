# Plugin hooks

<!--
  GENERATED FILE — do not edit.

  Written by scripts/plugin-hook-docs.mjs from packages/plugin-kit/src/{hooks,
  payloads,regions}.ts. Run `pnpm plugin:docs` after changing any of them; `pnpm
  verify` and CI run `pnpm plugin:docs:check` and fail when this file and the code
  disagree.
-->

**91 hooks** — 46 filters, 45 events — and 6 UI regions. **21 are wired**: something in the board fires
them today, and the rest are declared but not yet reached by a call site.

The wired column is derived from the tree by `scripts/hook-callsites.mjs`, not
maintained by hand — a registry entry with no call site is a promise about code
that never runs, and it fails in the quietest possible way: the plugin installs,
the handler registers, nothing happens. `plugins/reference` is required by its own
test to handle every wired hook, so a hook cannot join that column without
something proving it fires.

A **filter** is handed a value and returns a replacement; its result is used, so a
filter that throws or returns nothing leaves the value as it was and the chain
carries on with the next plugin. An **event** is told what happened and its return
value is discarded — which is why anything that only wants to observe should be one:
it cannot corrupt the thing it is watching even when it is wrong.

Handlers run in **(priority, plugin key)** order. Both halves are declared, so two
plugins compose the same way on every request and on every instance.

Every handler is called inside the host’s try/catch and is timed. A plugin that
fails repeatedly is switched off for the rest of the process and says so in its
health row. See [`plugin-api.md`](./plugin-api.md) for the policy, the lifecycle and
the limits.

## Content rendering (F36/F37/F71)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `bbcode.parse.text` | filter | — | `string` | `ViewerRef & { source: 'post' \| 'signature' \| 'pm' }` | F36 |
| `bbcode.render.html` | filter | — | `string` | `ViewerRef & { source: 'post' \| 'signature' \| 'pm' }` | F36 |
| `bbcode.tags` | filter | — | `readonly string[]` | `ForumRef \| Record<string, never>` | F37 |
| `post.body.html` | filter | — | `string` | `PostRef & ViewerRef` | F36 |
| `signature.html` | filter | — | `string` | `ViewerRef & { authorId: number }` | F58 |
| `smilies.list` | filter | — | `readonly { readonly code: string; readonly imageUrl: string }[]` | `ViewerRef` | F37 |
| `word-filter.patterns` | filter | — | `readonly { readonly pattern: string; readonly replacement: string }[]` | `Record<string, never>` | F71 |

- **`bbcode.parse.text`** — The raw BBCode source, before it is tokenised. Last chance to rewrite input.
- **`bbcode.render.html`** — Rendered HTML, after sanitising. Anything added here is trusted output — the sanitizer has already run and will not run again.
- **`bbcode.tags`** — The declarative custom-tag list, so a plugin can add a tag without core changes.
- **`post.body.html`** — One post’s rendered body, in the context of the thread it is being read in.
- **`signature.html`** — A member’s rendered signature, wherever it appears.
- **`smilies.list`** — The smilie set offered by the editor and substituted at render.
- **`word-filter.patterns`** — The render-time word filter’s pattern list.

## View models (F25–F34)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `view.header` | filter | yes | `HeaderModel` | `ViewerRef & RequestRef` | F27 |
| `view.user-panel` | filter | yes | `UserPanelModel` | `ViewerRef & RequestRef` | F27 |
| `view.navigation` | filter | — | `NavigationModel` | `ViewerRef & RequestRef` | F27 |
| `view.footer` | filter | yes | `FooterModel` | `ViewerRef & RequestRef` | F27 |
| `view.board-index` | filter | yes | `BoardIndexModel` | `ViewerRef` | F29 |
| `view.forum-row` | filter | yes | `ForumRowSlotModel` | `ViewerRef` | F29 |
| `view.thread-row` | filter | yes | `ThreadRowSlotModel` | `ViewerRef & ForumRef` | F30 |
| `view.post-bit` | filter | yes | `PostBitSlotModel` | `ViewerRef & ThreadRef` | F31 |
| `view.post-actions` | filter | yes | `PostActionsSlotModel` | `ViewerRef & ThreadRef` | F31 |
| `view.member-profile` | filter | yes | `MemberProfileModel` | `ViewerRef` | F33 |
| `view.board-stats` | filter | yes | `BoardStatsModel` | `ViewerRef` | F75 |
| `view.who-is-online` | filter | yes | `WhoIsOnlineModel` | `ViewerRef` | F75 |
| `view.pagination` | filter | yes | `PaginationModel` | `ViewerRef` | F30 |
| `view.search-form` | filter | yes | `SearchFormModel` | `ViewerRef` | F73 |
| `view.error-notice` | filter | yes | `ErrorNoticeModel` | `ViewerRef & RequestRef` | F34 |
| `view.shell` | filter | yes | `ShellModel` | `ViewerRef & RequestRef` | F27 |
| `view.notice` | filter | — | `NoticeModel` | `ViewerRef` | F27 |
| `view.category-block` | filter | — | `CategoryBlockModel` | `ViewerRef` | F29 |
| `view.subforum-list` | filter | yes | `SubforumListModel` | `ViewerRef & ForumRef` | F30 |
| `view.forum-display` | filter | yes | `ForumDisplayModel` | `ViewerRef & ForumRef` | F30 |
| `view.thread-view` | filter | yes | `ThreadViewModel` | `ViewerRef & ThreadRef` | F31 |
| `view.post-form` | filter | — | `PostFormModel` | `ViewerRef` | F39 |
| `view.redirect-notice` | filter | — | `RedirectNoticeModel` | `ViewerRef` | F34 |

- **`view.header`** — The header model, before the theme renders it.
- **`view.user-panel`** — The user panel model: greeting, counts, account links.
- **`view.navigation`** — The breadcrumb trail.
- **`view.footer`** — The footer model, including its link list.
- **`view.board-index`** — The index page model.
- **`view.forum-row`** — One forum row in a listing. Runs once per row — keep it cheap.
- **`view.thread-row`** — One thread row in a listing. Runs once per row.
- **`view.post-bit`** — One post as the theme will receive it. The busiest hook on the board: it runs once per post on every thread page.
- **`view.post-actions`** — The per-post control links. Adding one here does not create permission to use it.
- **`view.member-profile`** — A member’s profile model, including its custom fields and action links.
- **`view.board-stats`** — The board totals block.
- **`view.who-is-online`** — The online list, already resolved against the reader.
- **`view.pagination`** — A resolved page-link window.
- **`view.search-form`** — The search form model, including its filter options.
- **`view.error-notice`** — The error page model. Runs on the page that renders when things are broken.
- **`view.shell`** — The page frame’s model. Runs on every page including the error pages.
- **`view.notice`** — A board notice or flash message, before the theme renders it.
- **`view.category-block`** — One category on the index, with its rendered forum rows.
- **`view.subforum-list`** — The compact child-forum list above a thread listing.
- **`view.forum-display`** — A forum page’s model, including its rendered regions.
- **`view.thread-view`** — A thread page’s model, including its rendered post list.
- **`view.post-form`** — The composer page’s model. The form itself is app-rendered and arrives as a region.
- **`view.redirect-notice`** — The interstitial shown after a mutation, before the meta refresh fires.

## Posting (F39–F44)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `thread.create.validate` | filter | — | `ValidationMessages` | `{ draft: DraftPayload }` | F39 |
| `thread.create.before` | filter | — | `DraftPayload` | `ViewerRef` | F39 |
| `thread.created` | event | yes | `ThreadRef & { authorId: number; subject: string }` | `ViewerRef` | F39 |
| `post.create.validate` | filter | — | `ValidationMessages` | `{ draft: DraftPayload; threadId: number }` | F40 |
| `post.create.before` | filter | — | `DraftPayload` | `ViewerRef & { threadId: number }` | F40 |
| `post.created` | event | yes | `PostRef & { authorId: number }` | `ViewerRef` | F40 |
| `post.edit.before` | filter | — | `{ readonly body: string; readonly reason: string \| null }` | `PostRef & ViewerRef` | F41 |
| `post.edited` | event | yes | `PostRef & { editorId: number; revision: number }` | `ViewerRef` | F41 |
| `post.delete.before` | event | — | `PostRef` | `ModerationRef` | F41 |
| `post.deleted` | event | — | `PostRef` | `ModerationRef` | F41 |
| `post.restored` | event | — | `PostRef` | `ModerationRef` | F41 |
| `thread.moved` | event | — | `{ readonly threadId: number; readonly fromForumId: number; readonly toForumId: number }` | `ModerationRef` | F50 |
| `thread.merged` | event | — | `{ readonly keptThreadId: number; readonly mergedThreadId: number; readonly postCount: number }` | `ModerationRef` | F51 |
| `thread.split` | event | — | `{ readonly sourceThreadId: number; readonly newThreadId: number; readonly postCount: number }` | `ModerationRef` | F51 |
| `thread.locked` | event | — | `ThreadRef & { isLocked: boolean }` | `ModerationRef` | F50 |
| `thread.stickied` | event | — | `ThreadRef & { isSticky: boolean }` | `ModerationRef` | F50 |
| `attachment.upload.validate` | filter | — | `ValidationMessages` | `{ readonly filename: string readonly bytes: number /** What the *bytes* say it is, not what the name claims. */ readonly detectedMimeType: string readonly uploaderId: number }` | F42 |
| `attachment.uploaded` | event | — | `{ readonly attachmentId: number; readonly postId: number \| null; readonly bytes: number }` | `ViewerRef` | F42 |
| `attachment.deleted` | event | — | `{ readonly attachmentId: number }` | `ViewerRef` | F42 |
| `poll.created` | event | — | `ThreadRef & { pollId: number; optionCount: number }` | `ViewerRef` | F43 |
| `poll.voted` | event | — | `{ readonly pollId: number; readonly optionId: number }` | `ViewerRef` | F43 |
| `rating.recorded` | event | — | `{ readonly threadId: number; readonly rating: number; readonly average: number }` | `ViewerRef` | F43 |

- **`thread.create.validate`** — Validation messages for a new thread. Returning a non-empty list refuses the post.
- **`thread.create.before`** — The thread draft, before it is written. Subject, body, prefix, options.
- **`thread.created`** — A thread was created and committed.
- **`post.create.validate`** — Validation messages for a reply.
- **`post.create.before`** — The reply draft, before it is written.
- **`post.created`** — A reply was created and committed.
- **`post.edit.before`** — An edit’s new body and reason, before the revision is written.
- **`post.edited`** — A post was edited and a revision recorded.
- **`post.delete.before`** — A post is about to be soft-deleted. Observation only: refusing is a permission.
- **`post.deleted`** — A post was soft-deleted.
- **`post.restored`** — A soft-deleted post was restored.
- **`thread.moved`** — A thread changed forum. Carries both forum ids.
- **`thread.merged`** — Two threads became one.
- **`thread.split`** — Posts were split out into a new thread.
- **`thread.locked`** — A thread was opened or closed.
- **`thread.stickied`** — A thread was pinned or unpinned.
- **`attachment.upload.validate`** — Validation messages for an upload, after the magic-byte check. A plugin may refuse a file core would accept; it can never accept one core refused.
- **`attachment.uploaded`** — A file finished uploading and re-encoding.
- **`attachment.deleted`** — An attachment was removed, by a member or by the orphan sweep.
- **`poll.created`** — A poll was attached to a thread.
- **`poll.voted`** — A vote was cast. Fires once; the database enforces one per member.
- **`rating.recorded`** — A thread rating was recorded or changed.

## Moderation (F47–F54)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `report.created` | event | — | `{ readonly reportId: number readonly target: 'post' \| 'thread' \| 'user' \| 'pm' readonly targetId: number readonly reporterId: number }` | `RequestRef` | F49 |
| `report.resolved` | event | — | `{ readonly reportId: number; readonly resolution: 'actioned' \| 'rejected' }` | `ModerationRef` | F49 |
| `approval.queued` | event | — | `{ readonly kind: 'thread' \| 'post' \| 'attachment'; readonly id: number }` | `ViewerRef` | F48 |
| `approval.decided` | event | — | `{ readonly kind: 'thread' \| 'post' \| 'attachment' readonly id: number readonly approved: boolean }` | `ModerationRef` | F48 |
| `warning.issued` | event | — | `{ readonly warningId: number readonly userId: number readonly points: number readonly expiresAt: string \| null }` | `ModerationRef` | F53 |
| `warning.revoked` | event | — | `{ readonly warningId: number; readonly userId: number }` | `ModerationRef` | F53 |
| `moderation.logged` | event | — | `{ readonly action: string; readonly targetId: number \| null }` | `ModerationRef` | F50 |

- **`report.created`** — Something was reported. The hook a notifier or a webhook wants.
- **`report.resolved`** — A report was closed, with the resolution.
- **`approval.queued`** — Content entered the approval queue.
- **`approval.decided`** — Queued content was approved or rejected.
- **`warning.issued`** — A warning was issued, with its points and expiry.
- **`warning.revoked`** — A warning was revoked or expired.
- **`moderation.logged`** — A moderation action was written to the log.

## Identity (F17–F24)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `user.register.validate` | filter | — | `ValidationMessages` | `{ readonly username: string; readonly email: string; readonly ipPrefix: string \| null }` | F18 |
| `user.registered` | event | — | `UserRef & { username: string; requiresActivation: boolean }` | `RequestRef` | F18 |
| `user.activated` | event | — | `UserRef` | `RequestRef` | F18 |
| `user.login.attempted` | event | — | `{ readonly username: string readonly outcome: 'ok' \| 'bad-credentials' \| 'locked-out' \| 'banned' /** Truncated as F09 requires. Never a full address. */ readonly ipPrefix: string \| null }` | `RequestRef` | F19 |
| `user.logged-in` | event | — | `UserRef` | `RequestRef` | F19 |
| `user.logged-out` | event | — | `UserRef & { reason: 'requested' \| 'revoked' }` | `RequestRef` | F19 |
| `user.banned` | event | — | `UserRef & { expiresAt: string \| null }` | `ModerationRef` | F23 |
| `user.unbanned` | event | — | `UserRef & { expired: boolean }` | `ModerationRef` | F23 |
| `user.groups.changed` | event | — | `UserRef & { primaryGroupId: number; secondaryGroupIds: readonly number[] }` | `RequestRef` | F66 |
| `user.profile.updated` | event | — | `UserRef & { fields: readonly string[] }` | `RequestRef` | F57 |
| `user.merged` | event | — | `{ readonly keptUserId: number; readonly mergedUserId: number }` | `RequestRef` | F67 |
| `user.deleted` | event | — | `UserRef & { reason: 'pruned' \| 'deleted' }` | `RequestRef` | F67 |

- **`user.register.validate`** — Validation messages for a registration. Where a custom question or an external blocklist belongs.
- **`user.registered`** — An account was created, before or after activation depending on the mode.
- **`user.activated`** — An account finished activation.
- **`user.login.attempted`** — A sign-in was attempted, with the outcome. Never carries the password or the session token.
- **`user.logged-in`** — A session was established.
- **`user.logged-out`** — A session was ended, by the member or by revocation.
- **`user.banned`** — A member was banned, with the expiry when there is one.
- **`user.unbanned`** — A ban was lifted or expired and the prior group restored.
- **`user.groups.changed`** — Primary or secondary group membership changed.
- **`user.profile.updated`** — A member saved profile or option changes.
- **`user.merged`** — Two accounts were merged. Carries the winner and the account that went.
- **`user.deleted`** — An account was pruned or deleted.

## Mail, notifications, messages (F55–F61)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `notification.create.before` | filter | — | `{ readonly userId: number readonly kind: string readonly subjectText: string readonly href: string } \| null` | `RequestRef` | F55 |
| `notification.created` | event | — | `{ readonly notificationId: number; readonly userId: number }` | `RequestRef` | F55 |
| `mail.send.before` | filter | — | `{ readonly to: string readonly subject: string readonly textBody: string readonly htmlBody: string \| null } \| null` | `{ readonly template: string }` | F55 |
| `mail.sent` | event | — | `{ readonly to: string; readonly template: string }` | `RequestRef` | F55 |
| `pm.send.before` | filter | — | `{ readonly senderId: number readonly recipientIds: readonly number[] readonly subject: string readonly body: string } \| null` | `RequestRef` | F60 |
| `pm.sent` | event | — | `{ readonly messageId: number; readonly recipientIds: readonly number[] }` | `RequestRef` | F60 |
| `subscription.changed` | event | — | `{ readonly userId: number readonly target: 'thread' \| 'forum' readonly targetId: number readonly subscribed: boolean }` | `RequestRef` | F56 |
| `reputation.changed` | event | — | `{ readonly userId: number; readonly delta: number; readonly total: number }` | `ViewerRef` | F62 |

- **`notification.create.before`** — A notification about to be created. Returning `null` suppresses it.
- **`notification.created`** — A notification was stored.
- **`mail.send.before`** — A queued message, before it is handed to the mail driver. Subject, body and recipient; returning `null` drops it.
- **`mail.sent`** — A message was accepted by the driver. Not proof of delivery.
- **`pm.send.before`** — A private message, before it is stored.
- **`pm.sent`** — A private message was delivered to its recipients’ folders.
- **`subscription.changed`** — A member subscribed to or unsubscribed from a thread or forum.
- **`reputation.changed`** — Reputation was given, changed or removed.

## Search, discovery, syndication (F72–F76)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `search.query.before` | filter | — | `string` | `ViewerRef` | F72 |
| `search.results` | filter | — | `readonly { readonly postId: number; readonly threadId: number; readonly rank: number }[]` | `ViewerRef & { terms: string }` | F72 |
| `feed.items` | filter | — | `readonly { readonly title: string readonly href: string readonly publishedAt: string readonly summary: string }[] /** Always a guest: a feed is cached under a shared URL (D82). */` | `{ readonly feed: 'board' \| 'forum' \| 'thread' }` | F76 |
| `sitemap.entries` | filter | — | `readonly { readonly href: string; readonly lastModified: string \| null }[]` | `{ readonly chunk: number }` | F76 |
| `metadata.page` | filter | — | `{ readonly title: string readonly description: string \| null readonly canonical: string readonly imageUrl: string \| null }` | `{ readonly route: string }` | F76 |

- **`search.query.before`** — The parsed search terms, before the query runs. The scope is not filterable.
- **`search.results`** — A page of results, already permission-filtered in SQL. A plugin may reorder or drop; adding a row here would add one the viewer may not see.
- **`feed.items`** — The items of a feed, rendered as a guest. Anything added is public.
- **`sitemap.entries`** — One chunk of the sitemap.
- **`metadata.page`** — Title, description and social card for a page.

## Admin and system (F63–F70)

| Hook | Kind | Wired | Value | Context | Feature |
|---|---|---|---|---|---|
| `admin.navigation` | filter | — | `readonly { readonly label: string; readonly href: string }[]` | `ViewerRef` | F63 |
| `settings.saved` | event | — | `{ readonly keys: readonly string[] }` | `{ readonly adminId: number }` | F64 |
| `task.run.before` | event | — | `{ readonly taskId: string }` | `Record<string, never>` | F06 |
| `task.run.after` | event | — | `{ readonly taskId: string; readonly ok: boolean; readonly durationMs: number }` | `Record<string, never>` | F06 |
| `cache.invalidated` | event | — | `{ readonly tag: string }` | `Record<string, never>` | F10 |
| `plugin.enabled` | event | — | `{ readonly pluginKey: string }` | `Record<string, never>` | F79 |
| `plugin.disabled` | event | — | `{ readonly pluginKey: string; readonly reason: 'operator' \| 'failures' }` | `Record<string, never>` | F79 |

- **`admin.navigation`** — The admin panel’s section links, so a plugin page can be reached.
- **`settings.saved`** — Board settings changed. Carries the keys, never the values.
- **`task.run.before`** — A scheduled task is about to run.
- **`task.run.after`** — A scheduled task finished, with its outcome and duration.
- **`cache.invalidated`** — A cache tag was invalidated.
- **`plugin.enabled`** — A plugin was enabled — including this one, which is how it learns it is on.
- **`plugin.disabled`** — A plugin was disabled, by an operator or by the host after repeated failures. Carries the reason.

## UI regions

Regions are **not** theme slots. A theme owns its slots; a region is an explicit
"plugins may add something here" point that a theme chooses to render, so the theme
keeps control of where plugin output appears and the plugin keeps control of what it
is. Several plugins contributing to one region compose by concatenation, in the same
deterministic order as hooks.

| Region | What it is handed |
|---|---|
| `header.notice` | The viewer. |
| `index.footer` | The viewer. |
| `postbit.badges` | The viewer, the post id and the author id. |
| `postbit.footer` | The viewer, the post id and the author id. |
| `profile.panel` | The viewer and the profile’s member id. |
| `admin.dashboard` | The viewer. |

- **`header.notice`** — Directly below the board header, above the page body. Board-wide notices.
- **`index.footer`** — The bottom of the board index, below the statistics block.
- **`postbit.badges`** — Beside a post author’s name. Runs once per post on every thread page — the most expensive region on the board, and the one to keep trivial.
- **`postbit.footer`** — Below a post body, above its actions.
- **`profile.panel`** — A panel on a member’s profile, below the standard fields.
- **`admin.dashboard`** — A card on the admin dashboard. Only rendered for administrators.
