# Plugin hooks

<!--
  GENERATED FILE — do not edit.

  Written by scripts/plugin-hook-docs.mjs from packages/plugin-kit/src/{hooks,
  payloads,regions}.ts. Run `pnpm plugin:docs` after changing any of them; `pnpm
  verify` and CI run `pnpm plugin:docs:check` and fail when this file and the code
  disagree.
-->

104 hooks: 59 filters and 45 events. 8 UI regions.

104 hooks have call sites in this build. The Wired column is generated from the source tree.

Filters return replacement values; throwing or returning undefined retains the previous value. Event return values are ignored.

Handlers run by priority, then plugin key. See [Hooks and lifecycle](../extensions/plugin-hooks-guide.md) for failures, runtime access and lifecycle rules.

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

- **`markdown.parse.text`** — Raw Markdown before parsing.
- **`markdown.render.html`** — Rendered HTML. Replacement markup is trusted and is not escaped afterwards.
- **`markdown.directives`** — Board-wide directives for `:::name` blocks and `:name[…]` spans. The list must not depend on the reader because rendered bodies are shared.
- **`post.body.html`** — Rendered post body with thread and viewer context.
- **`signature.html`** — A member’s rendered signature, wherever it appears.
- **`smilies.list`** — Board-wide smilie substitutions. The list must not depend on the reader.
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
- **`view.forum-jump`** — Forum jump options. Destinations require real forum IDs; the route rechecks permission on submission.
- **`view.announcement`** — Announcement model with rendered HTML. Replacement body markup is trusted.
- **`view.board-index`** — The index page model.
- **`view.forum-row`** — Forum listing row. Runs once per row.
- **`view.thread-row`** — One thread row in a listing. Runs once per row.
- **`view.post-bit`** — Post model. Runs once per post on each thread page.
- **`view.post-actions`** — The per-post control links. Adding one here does not create permission to use it.
- **`view.member-profile`** — A member’s profile model, including its custom fields and action links.
- **`view.board-stats`** — The board totals block.
- **`view.who-is-online`** — The online list, already resolved against the reader.
- **`view.latest-threads`** — Latest threads panel. Runs on initial render and each live refresh.
- **`view.latest-posts`** — Latest posts panel. Runs on initial render and each live refresh.
- **`view.pagination`** — A resolved page-link window.
- **`view.search-form`** — The search form model, including its filter options.
- **`view.search-results`** — Search results authorised for the viewer. Added rows require separate visibility checks.
- **`view.discovery-view`** — Discovery listing and tabs. Existing rows are authorised; added rows require separate visibility checks.
- **`view.auth-page`** — Sign-in, registration or password-reset page. The app supplies the form as a rendered region.
- **`view.panel-shell`** — Control panel frame and links. Adding links does not grant access.
- **`view.panel-nav`** — Control panel navigation with the current section. Runs on each panel page.
- **`view.panel-page`** — Control panel page heading. Runs on each panel page.
- **`view.panel-section`** — Panel section. Runs once per section.
- **`view.error-notice`** — Error page model.
- **`view.shell`** — Page frame. Runs on every page, including error pages.
- **`view.notice`** — A board notice or flash message, before the theme renders it.
- **`view.category-block`** — One category on the index, with its rendered forum rows.
- **`view.subforum-list`** — The compact child-forum list above a thread listing.
- **`view.forum-display`** — A forum page’s model, including its rendered regions.
- **`view.thread-view`** — A thread page’s model, including its rendered post list.
- **`view.post-form`** — The composer page’s model. The form itself is app-rendered and arrives as a region.
- **`view.quick-reply`** — Quick-reply model. The app supplies the reply form as `children`.
- **`view.editor-toolbar`** — The composer’s formatting-toolbar model — its buttons and the attachment picker.
- **`view.redirect-notice`** — Post-mutation redirect notice. The target is checked again after filtering and must remain on the board.

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
- **`post.delete.before`** — Post scheduled for soft deletion. Cannot veto deletion.
- **`post.deleted`** — A post was soft-deleted.
- **`post.restored`** — A soft-deleted post was restored.
- **`thread.moved`** — A thread changed forum. Carries both forum ids.
- **`thread.merged`** — Two threads became one.
- **`thread.split`** — Posts were split out into a new thread.
- **`thread.locked`** — A thread was opened or closed.
- **`thread.stickied`** — A thread was pinned or unpinned.
- **`attachment.upload.validate`** — Upload validation after file-type checks. Can reject an accepted file; cannot accept a file rejected by core.
- **`attachment.uploaded`** — Upload stored. Image processing may still be pending.
- **`attachment.deleted`** — An attachment was removed, by a member or by the orphan sweep.
- **`poll.created`** — A poll was attached to a thread.
- **`poll.voted`** — Vote recorded. Runs for each chosen option, including replacement votes.
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

- **`report.created`** — Report created.
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

- **`user.register.validate`** — Registration validation messages. Use for additional questions or blocklists.
- **`user.registered`** — An account was created, before or after activation depending on the mode.
- **`user.activated`** — An account finished activation.
- **`user.login.attempted`** — Sign-in attempt and outcome. Excludes passwords and session tokens.
- **`user.logged-in`** — A session was established.
- **`user.logged-out`** — A session was ended, by the member or by revocation.
- **`user.banned`** — A member was banned, with the expiry when there is one.
- **`user.unbanned`** — A ban was lifted or expired and the prior group restored.
- **`user.groups.changed`** — Primary or secondary group membership changed.
- **`user.profile.updated`** — A member saved profile or option changes.
- **`user.merged`** — Account merge with retained and removed account IDs.
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
- **`mail.send.before`** — Queued email before driver submission. Return `null` to suppress it.
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
- **`search.results`** — Search results authorised in SQL. Reorder or remove rows; check visibility before adding any.
- **`feed.items`** — Feed entries after visibility filtering. May contain private member content; do not share entries between requests. Added rows require separate visibility checks.
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
- **`plugin.enabled`** — Plugin enabled. Includes the enabled plugin itself.
- **`plugin.disabled`** — Plugin disabled by an operator or after repeated failures, with the reason.

## UI regions

Themes place these regions. Enabled plugin contributions are concatenated in hook order.

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
- **`postbit.badges`** — Author badges. Runs once per post; avoid per-post queries.
- **`postbit.footer`** — Below a post body, above its actions.
- **`threadrow.badges`** — Thread-list badges. Runs once per page with visible thread references; returns badges keyed by thread ID.
- **`thread.header`** — Below the thread title and above the first post. Runs once per thread page.
- **`profile.panel`** — A panel on a member’s profile, below the standard fields.
- **`admin.dashboard`** — A card on the admin dashboard. Only rendered for administrators.
