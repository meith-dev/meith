# Plugin hooks

<!--
  GENERATED FILE — do not edit.

  Written by scripts/plugin-hook-docs.mjs from packages/plugin-kit/src/{hooks,
  payloads,regions}.ts. Run `pnpm plugin:docs` after changing any of them; `pnpm
  verify` and CI run `pnpm plugin:docs:check` and fail when this file and the code
  disagree.
-->

**104 hooks** — 59 filters, 45 events — and 8 UI regions. **104 are wired**: something in the board fires
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

Every handler is called inside the host’s try/catch and is timed. Failures are
counted in the database, so a plugin that fails repeatedly is switched off across
the whole board and stays off until an operator clears the record. See
[`plugins.md`](../customization/plugins.md) for the policy, the lifecycle and the limits.

## Content rendering

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `markdown.parse.text` | filter | yes | `string` | `ViewerRef & { source: 'post' \| 'signature' \| 'pm' }` |
| `markdown.render.html` | filter | yes | `string` | `ViewerRef & { source: 'post' \| 'signature' \| 'pm' }` |
| `markdown.directives` | filter | yes | `readonly { readonly name: string; readonly block: boolean }[]` | `ForumRef \| Record<string, never>` |
| `post.body.html` | filter | yes | `string` | `PostRef & ViewerRef` |
| `signature.html` | filter | yes | `string` | `ViewerRef & { authorId: number }` |
| `smilies.list` | filter | yes | `readonly { readonly code: string; readonly src: string; readonly alt?: string }[]` | `Record<string, never>` |
| `word-filter.patterns` | filter | yes | `readonly { readonly pattern: string; readonly replacement: string; readonly wholeWord: boolean }[]` | `Record<string, never>` |

- **`markdown.parse.text`** — The raw Markdown source, before it is parsed. Last chance to rewrite input.
- **`markdown.render.html`** — Rendered HTML, after the renderer has constructed it. Anything added here is trusted output and nothing escapes it afterwards.
- **`markdown.directives`** — The declarative directive list, so a plugin can add a `:::name` block or `:name[…]` span without core changes. Board-wide: rendered bodies are stored and shared, so the set cannot depend on who is reading.
- **`post.body.html`** — One post’s rendered body, in the context of the thread it is being read in.
- **`signature.html`** — A member’s rendered signature, wherever it appears.
- **`smilies.list`** — The smilie set substituted at render. Board-wide, for the same reason the directive list is.
- **`word-filter.patterns`** — The render-time word filter’s pattern list.

## View models

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `view.header` | filter | yes | `HeaderModel` | `ViewerRef & RequestRef` |
| `view.user-panel` | filter | yes | `UserPanelModel` | `ViewerRef & RequestRef` |
| `view.navigation` | filter | yes | `NavigationModel` | `ViewerRef & RequestRef` |
| `view.footer` | filter | yes | `FooterModel` | `ViewerRef & RequestRef` |
| `view.forum-jump` | filter | yes | `ForumJumpModel` | `ViewerRef & RequestRef` |
| `view.announcement` | filter | yes | `AnnouncementModel` | `ViewerRef` |
| `view.board-index` | filter | yes | `BoardIndexModel` | `ViewerRef` |
| `view.forum-row` | filter | yes | `ForumRowSlotModel` | `ViewerRef` |
| `view.thread-row` | filter | yes | `ThreadRowSlotModel` | `ViewerRef & ForumRef` |
| `view.post-bit` | filter | yes | `PostBitSlotModel` | `ViewerRef & ThreadRef` |
| `view.post-actions` | filter | yes | `PostActionsSlotModel` | `ViewerRef & ThreadRef` |
| `view.member-profile` | filter | yes | `MemberProfileModel` | `ViewerRef` |
| `view.board-stats` | filter | yes | `BoardStatsModel` | `ViewerRef` |
| `view.who-is-online` | filter | yes | `WhoIsOnlineModel` | `ViewerRef` |
| `view.latest-threads` | filter | yes | `LatestThreadsModel` | `ViewerRef` |
| `view.latest-posts` | filter | yes | `LatestPostsModel` | `ViewerRef` |
| `view.pagination` | filter | yes | `PaginationModel` | `ViewerRef` |
| `view.search-form` | filter | yes | `SearchFormModel` | `ViewerRef` |
| `view.search-results` | filter | yes | `SearchResultsModel` | `ViewerRef` |
| `view.discovery-view` | filter | yes | `DiscoveryViewModel` | `ViewerRef` |
| `view.auth-page` | filter | yes | `AuthPageModel` | `ViewerRef` |
| `view.panel-shell` | filter | yes | `PanelShellModel` | `ViewerRef` |
| `view.panel-nav` | filter | yes | `PanelNavModel` | `ViewerRef` |
| `view.panel-page` | filter | yes | `PanelPageModel` | `ViewerRef` |
| `view.panel-section` | filter | yes | `PanelSectionModel` | `ViewerRef` |
| `view.error-notice` | filter | yes | `ErrorNoticeModel` | `ViewerRef & RequestRef` |
| `view.shell` | filter | yes | `ShellModel` | `ViewerRef & RequestRef` |
| `view.notice` | filter | yes | `NoticeModel` | `ViewerRef` |
| `view.category-block` | filter | yes | `CategoryBlockModel` | `ViewerRef` |
| `view.subforum-list` | filter | yes | `SubforumListModel` | `ViewerRef & ForumRef` |
| `view.forum-display` | filter | yes | `ForumDisplayModel` | `ViewerRef & ForumRef` |
| `view.thread-view` | filter | yes | `ThreadViewModel` | `ViewerRef & ThreadRef` |
| `view.post-form` | filter | yes | `PostFormModel` | `ViewerRef` |
| `view.quick-reply` | filter | yes | `QuickReplyModel` | `ViewerRef & ThreadRef` |
| `view.editor-toolbar` | filter | yes | `EditorToolbarModel` | `ViewerRef` |
| `view.redirect-notice` | filter | yes | `RedirectNoticeModel` | `ViewerRef` |

- **`view.header`** — The header model, before the theme renders it.
- **`view.user-panel`** — The user panel model: greeting, counts, account links.
- **`view.navigation`** — The breadcrumb trail.
- **`view.footer`** — The footer model, including its link list.
- **`view.forum-jump`** — The jump box model. A plugin adding a destination must give it a real forum id — the route re-authorises whatever is submitted.
- **`view.announcement`** — One announcement, on its way to the theme. Its body is already rendered HTML from the boardu2019s own renderer, so a plugin replacing it is replacing trusted markup — the one hook where that is true of a body.
- **`view.board-index`** — The index page model.
- **`view.forum-row`** — One forum row in a listing. Runs once per row — keep it cheap.
- **`view.thread-row`** — One thread row in a listing. Runs once per row.
- **`view.post-bit`** — One post as the theme will receive it. The busiest hook on the board: it runs once per post on every thread page.
- **`view.post-actions`** — The per-post control links. Adding one here does not create permission to use it.
- **`view.member-profile`** — A member’s profile model, including its custom fields and action links.
- **`view.board-stats`** — The board totals block.
- **`view.who-is-online`** — The online list, already resolved against the reader.
- **`view.latest-threads`** — The index sidebar’s newest-threads panel. Runs again on every refresh of the live region, not only on the page load — keep it cheap.
- **`view.latest-posts`** — The index sidebar’s newest-posts panel. Same refresh cost as view.latest-threads.
- **`view.pagination`** — A resolved page-link window.
- **`view.search-form`** — The search form model, including its filter options.
- **`view.search-results`** — One page of search results. Already checked against the reader — a hit a plugin adds here has not been, and will be shown to whoever asked.
- **`view.discovery-view`** — A discovery listing — new posts, today, unanswered — with its tabs. Same warning as the search results: the rows arrive authorised.
- **`view.auth-page`** — The sign-in, register and password-reset page around its form. The form itself is a region, not a value: nothing here can change what it posts to.
- **`view.panel-shell`** — The frame around a control panel, including the links to the other panels this viewer may reach. Adding a link grants nothing.
- **`view.panel-nav`** — A control panel’s section rail, with the current section already resolved. Runs on every panel page.
- **`view.panel-page`** — One control-panel page’s heading block. Runs on every panel page.
- **`view.panel-section`** — One labelled section inside a panel page. Runs once per section.
- **`view.error-notice`** — The error page model. Runs on the page that renders when things are broken.
- **`view.shell`** — The page frame’s model. Runs on every page including the error pages.
- **`view.notice`** — A board notice or flash message, before the theme renders it.
- **`view.category-block`** — One category on the index, with its rendered forum rows.
- **`view.subforum-list`** — The compact child-forum list above a thread listing.
- **`view.forum-display`** — A forum page’s model, including its rendered regions.
- **`view.thread-view`** — A thread page’s model, including its rendered post list.
- **`view.post-form`** — The composer page’s model. The form itself is app-rendered and arrives as a region.
- **`view.quick-reply`** — The quick-reply island’s model, at the foot of a thread. The reply form itself is app-rendered and arrives as `children`.
- **`view.editor-toolbar`** — The composer’s formatting-toolbar model — its buttons and the attachment picker.
- **`view.redirect-notice`** — The interstitial shown after a mutation, before the meta refresh fires. The target is re-checked against the board after the filter runs, so this cannot send a member off-site.

## Posting

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `thread.create.validate` | filter | yes | `ValidationMessages` | `{ draft: DraftPayload }` |
| `thread.create.before` | filter | yes | `DraftPayload` | `ViewerRef` |
| `thread.created` | event | yes | `ThreadRef & { authorId: number; subject: string }` | `ViewerRef` |
| `post.create.validate` | filter | yes | `ValidationMessages` | `{ draft: DraftPayload; threadId: number }` |
| `post.create.before` | filter | yes | `DraftPayload` | `ViewerRef & { threadId: number }` |
| `post.created` | event | yes | `PostRef & { authorId: number }` | `ViewerRef` |
| `post.edit.before` | filter | yes | `{ readonly body: string; readonly reason: string \| null }` | `PostRef & ViewerRef` |
| `post.edited` | event | yes | `PostRef & { editorId: number; revision: number }` | `ViewerRef` |
| `post.delete.before` | event | yes | `PostRef` | `ModerationRef` |
| `post.deleted` | event | yes | `PostRef` | `ModerationRef` |
| `post.restored` | event | yes | `PostRef` | `ModerationRef` |
| `thread.moved` | event | yes | `{ readonly threadId: number; readonly fromForumId: number; readonly toForumId: number }` | `ModerationRef` |
| `thread.merged` | event | yes | `{ readonly keptThreadId: number; readonly mergedThreadId: number; readonly postCount: number }` | `ModerationRef` |
| `thread.split` | event | yes | `{ readonly sourceThreadId: number; readonly newThreadId: number; readonly postCount: number }` | `ModerationRef` |
| `thread.locked` | event | yes | `ThreadRef & { isLocked: boolean }` | `ModerationRef` |
| `thread.stickied` | event | yes | `ThreadRef & { isSticky: boolean }` | `ModerationRef` |
| `attachment.upload.validate` | filter | yes | `ValidationMessages` | `{ readonly filename: string; readonly bytes: number; readonly detectedMimeType: string; readonly uploaderId: number }` |
| `attachment.uploaded` | event | yes | `{ readonly attachmentId: number; readonly postId: number \| null; readonly bytes: number }` | `ViewerRef` |
| `attachment.deleted` | event | yes | `{ readonly attachmentId: number }` | `ViewerRef` |
| `poll.created` | event | yes | `ThreadRef & { pollId: number; optionCount: number }` | `ViewerRef` |
| `poll.voted` | event | yes | `{ readonly pollId: number; readonly optionId: number }` | `ViewerRef` |
| `rating.recorded` | event | yes | `{ readonly threadId: number; readonly rating: number; readonly average: number }` | `ViewerRef` |

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
- **`poll.voted`** — A vote was cast, once per option chosen. It fires again when a poll that allows re-voting takes a replacement.
- **`rating.recorded`** — A thread rating was recorded or changed.

## Moderation

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `report.created` | event | yes | `{ readonly reportId: number; readonly target: 'post' \| 'thread' \| 'user' \| 'pm'; readonly targetId: number; readonly reporterId: number }` | `RequestRef` |
| `report.resolved` | event | yes | `{ readonly reportId: number; readonly resolution: 'actioned' \| 'rejected' }` | `ModerationRef` |
| `approval.queued` | event | yes | `{ readonly kind: 'thread' \| 'post' \| 'attachment'; readonly id: number }` | `ViewerRef` |
| `approval.decided` | event | yes | `{ readonly kind: 'thread' \| 'post' \| 'attachment'; readonly id: number; readonly approved: boolean }` | `ModerationRef` |
| `warning.issued` | event | yes | `{ readonly warningId: number; readonly userId: number; readonly points: number; readonly expiresAt: string \| null }` | `ModerationRef` |
| `warning.revoked` | event | yes | `{ readonly warningId: number; readonly userId: number }` | `ModerationRef` |
| `moderation.logged` | event | yes | `{ readonly action: string; readonly targetId: number \| null }` | `ModerationRef` |

- **`report.created`** — Something was reported. The hook a notifier or a webhook wants.
- **`report.resolved`** — A report was closed, with the resolution.
- **`approval.queued`** — Content entered the approval queue.
- **`approval.decided`** — Queued content was approved or rejected.
- **`warning.issued`** — A warning was issued, with its points and expiry.
- **`warning.revoked`** — A warning was revoked or expired.
- **`moderation.logged`** — A moderation action was written to the log.

## Identity

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `user.register.validate` | filter | yes | `ValidationMessages` | `{ readonly username: string; readonly email: string; readonly ipPrefix: string \| null }` |
| `user.registered` | event | yes | `UserRef & { username: string; requiresActivation: boolean }` | `RequestRef` |
| `user.activated` | event | yes | `UserRef` | `RequestRef` |
| `user.login.attempted` | event | yes | `{ readonly username: string; readonly outcome: 'ok' \| 'bad-credentials' \| 'locked-out' \| 'banned'; readonly ipPrefix: string \| null }` | `RequestRef` |
| `user.logged-in` | event | yes | `UserRef` | `RequestRef` |
| `user.logged-out` | event | yes | `UserRef & { reason: 'requested' \| 'revoked' }` | `RequestRef` |
| `user.banned` | event | yes | `UserRef & { expiresAt: string \| null }` | `ModerationRef` |
| `user.unbanned` | event | yes | `UserRef & { expired: boolean }` | `ModerationRef` |
| `user.groups.changed` | event | yes | `UserRef & { primaryGroupId: number; secondaryGroupIds: readonly number[] }` | `RequestRef` |
| `user.profile.updated` | event | yes | `UserRef & { fields: readonly string[] }` | `RequestRef` |
| `user.merged` | event | yes | `{ readonly keptUserId: number; readonly mergedUserId: number }` | `RequestRef` |
| `user.deleted` | event | yes | `UserRef & { reason: 'pruned' \| 'deleted' }` | `RequestRef` |

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

## Mail, notifications, messages

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `notification.create.before` | filter | yes | `{ readonly userId: number; readonly kind: string; readonly subjectText: string; readonly href: string } \| null` | `RequestRef` |
| `notification.created` | event | yes | `{ readonly notificationId: number; readonly userId: number }` | `RequestRef` |
| `mail.send.before` | filter | yes | `{ readonly to: string; readonly subject: string; readonly textBody: string; readonly htmlBody: string \| null } \| null` | `{ readonly template: string }` |
| `mail.sent` | event | yes | `{ readonly to: string; readonly template: string }` | `RequestRef` |
| `pm.send.before` | filter | yes | `{ readonly senderId: number; readonly recipientIds: readonly number[]; readonly subject: string; readonly body: string } \| null` | `RequestRef` |
| `pm.sent` | event | yes | `{ readonly messageId: number; readonly recipientIds: readonly number[] }` | `RequestRef` |
| `subscription.changed` | event | yes | `{ readonly userId: number; readonly target: 'thread' \| 'forum'; readonly targetId: number; readonly subscribed: boolean }` | `RequestRef` |
| `reputation.changed` | event | yes | `{ readonly userId: number; readonly delta: number; readonly total: number }` | `ViewerRef` |

- **`notification.create.before`** — A notification about to be created. Returning `null` suppresses it.
- **`notification.created`** — A notification was stored.
- **`mail.send.before`** — A queued message, before it is handed to the mail driver. Subject, body and recipient; returning `null` drops it.
- **`mail.sent`** — A message was accepted by the driver. Not proof of delivery.
- **`pm.send.before`** — A private message, before it is stored.
- **`pm.sent`** — A private message was delivered to its recipients’ folders.
- **`subscription.changed`** — A member subscribed to or unsubscribed from a thread or forum.
- **`reputation.changed`** — Reputation was given, changed or removed.

## Search, discovery, syndication

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `search.query.before` | filter | yes | `string` | `ViewerRef` |
| `search.results` | filter | yes | `readonly { readonly postId: number; readonly threadId: number; readonly rank: number }[]` | `ViewerRef & { terms: string }` |
| `feed.items` | filter | yes | `readonly { readonly title: string; readonly href: string; readonly publishedAt: string; readonly summary: string }[]` | `{ readonly feed: 'board' \| 'forum' \| 'thread' }` |
| `sitemap.entries` | filter | yes | `readonly { readonly href: string; readonly lastModified: string \| null }[]` | `{ readonly chunk: number }` |
| `metadata.page` | filter | yes | `{ readonly title: string; readonly description: string \| null; readonly canonical: string; readonly imageUrl: string \| null }` | `{ readonly route: string }` |

- **`search.query.before`** — The parsed search terms, before the query runs. The scope is not filterable.
- **`search.results`** — A page of results, already permission-filtered in SQL. A plugin may reorder or drop; adding a row here would add one the viewer may not see.
- **`feed.items`** — The items of a feed, rendered as a guest. Anything added is public.
- **`sitemap.entries`** — One chunk of the sitemap.
- **`metadata.page`** — Title, description and social card for a page.

## Admin and system

| Hook | Kind | Wired | Value | Context |
|---|---|---|---|---|
| `admin.navigation` | filter | yes | `readonly { readonly label: string; readonly href: string }[]` | `ViewerRef` |
| `settings.saved` | event | yes | `{ readonly keys: readonly string[] }` | `{ readonly adminId: number }` |
| `task.run.before` | event | yes | `{ readonly taskId: string }` | `Record<string, never>` |
| `task.run.after` | event | yes | `{ readonly taskId: string; readonly ok: boolean; readonly durationMs: number }` | `Record<string, never>` |
| `cache.invalidated` | event | yes | `{ readonly tag: string }` | `Record<string, never>` |
| `plugin.enabled` | event | yes | `{ readonly pluginKey: string }` | `Record<string, never>` |
| `plugin.disabled` | event | yes | `{ readonly pluginKey: string; readonly reason: 'operator' \| 'failures' }` | `Record<string, never>` |

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
| `header.notice` | The viewer, with the reader’s locale and a translator. |
| `index.footer` | The viewer, with the reader’s locale and a translator. |
| `postbit.badges` | The viewer, the post id and the author id, with the reader’s locale and a translator. |
| `postbit.footer` | The viewer, the post id and the author id, with the reader’s locale and a translator. |
| `threadrow.badges` | The viewer and the page’s visible threads, each as a thread id and its author id, with the reader’s locale and a translator. |
| `thread.header` | The viewer, the thread id and the thread author’s id, with the reader’s locale and a translator. |
| `profile.panel` | The viewer and the profile’s member id, with the reader’s locale and a translator. |
| `admin.dashboard` | The viewer, with the reader’s locale and a translator. |

- **`header.notice`** — Directly below the board header, above the page body. Board-wide notices.
- **`index.footer`** — The bottom of the board index, below the statistics block.
- **`postbit.badges`** — Beside a post author’s name. Runs once per post on every thread page — the most expensive region on the board, and the one to keep trivial.
- **`postbit.footer`** — Below a post body, above its actions.
- **`threadrow.badges`** — Beside a thread’s title in a listing, to mark threads across a forum page. A batch region: unlike every other region it runs once per page, not once per row — a listing of twenty threads is one call, returning a badge per thread id — because a forum page is on a tight budget and a per-row region there is twenty calls before the page has drawn a thing.
- **`thread.header`** — Above the first post of a thread, below its title. Runs once per thread page, so unlike postbit.* it can afford to read from the plugin’s own tables.
- **`profile.panel`** — A panel on a member’s profile, below the standard fields.
- **`admin.dashboard`** — A card on the admin dashboard. Only rendered for administrators.
