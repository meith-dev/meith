/**
 * The hook registry.
 *
 * Every point at which a plugin may observe or alter what the board does is
 * named here, exactly once, with its **kind**. The registry is data for the same
 * three reasons the slot registry is: a type map is derived from it, a host
 * dispatches through it, and a documentation generator reads it.
 *
 * ## Two kinds, and the difference is the whole safety model
 *
 * A **filter** is handed a value and returns a replacement. Its result is used,
 * so a filter that throws, hangs or returns rubbish changes what a reader sees.
 * Filters are chained: each plugin receives what the previous one returned.
 *
 * An **event** is told that something happened and its return value is
 * discarded. An event handler cannot change an outcome, which is why anything
 * that merely wants to know — logging, an outbound webhook, a counter — must be
 * an event and not a filter. Making it a filter would give it the power to
 * corrupt the thing it only wanted to watch.
 *
 * The kind is declared rather than inferred because the same handler signature
 * fits both, and the difference is invisible at the call site of a plugin.
 *
 * ## Deterministic
 *
 * "Typed deterministic hooks" is the acceptance criterion, and the second word
 * is the harder one. Two plugins filtering the same value must compose the same
 * way on every request, on every instance, in every deployment — otherwise a
 * board's rendered output depends on module evaluation order, which differs
 * between the dev server, a serverless bundle and the worker.
 *
 * So ordering is **(priority, plugin key)**, both total and both declared: never
 * registration order, never the order `meith.config.ts` happens to list plugins
 * in, and never `Object.keys`. See `host.ts`.
 *
 * ## What is deliberately not here
 *
 * There is no hook that decides **authorization**, and there never will be one.
 * `authorization.can()` is the single answer to "may this actor do this",
 * and a plugin able to filter its result is a plugin able to grant itself
 * anything. Plugins receive what a viewer may already see and change how it is
 * presented or what happens afterwards.
 *
 * For the same reason there is no hook inside the visibility filter. A
 * plugin that could rewrite a `where` clause is a plugin that can leak a private
 * forum, and no amount of isolation makes that recoverable.
 */

export type HookKind = 'filter' | 'event'

export interface HookSpec {
  readonly kind: HookKind
  /** What a plugin is seeing or changing. */
  readonly purpose: string
}

/**
 * Every hook, with its kind. `as const` so `HOOKS[K]['kind']` is a literal type
 * and the handler signature can branch on it.
 */
export const HOOKS = {
  /* ---- Content rendering ---- */
  'markdown.parse.text': {
    kind: 'filter',
    purpose: 'Raw Markdown before parsing.',
  },
  'markdown.render.html': {
    kind: 'filter',
    purpose: 'Rendered HTML. Replacement markup is trusted and is not escaped afterwards.',
  },
  'markdown.directives': {
    kind: 'filter',
    purpose:
      'Board-wide directives for `:::name` blocks and `:name[…]` spans. The list must not depend on the reader because rendered bodies are shared.',
  },
  'post.body.html': {
    kind: 'filter',
    purpose: 'Rendered post body with thread and viewer context.',
  },
  'signature.html': {
    kind: 'filter',
    purpose: 'A member’s rendered signature, wherever it appears.',
  },
  'smilies.list': {
    kind: 'filter',
    purpose: 'Board-wide smilie substitutions. The list must not depend on the reader.',
  },
  'word-filter.patterns': {
    kind: 'filter',
    purpose: 'The render-time word filter’s pattern list.',
  },

  /* ---- View models ---- */
  'view.header': {
    kind: 'filter',
    purpose: 'The header model, before the theme renders it.',
  },
  'view.user-panel': {
    kind: 'filter',
    purpose: 'The user panel model: greeting, counts, account links.',
  },
  'view.navigation': {
    kind: 'filter',
    purpose: 'The breadcrumb trail.',
  },
  'view.footer': {
    kind: 'filter',
    purpose: 'The footer model, including its link list.',
  },
  'view.forum-jump': {
    kind: 'filter',
    purpose:
      'Forum jump options. Destinations require real forum IDs; the route rechecks permission on submission.',
  },
  'view.announcement': {
    kind: 'filter',
    purpose: 'Announcement model with rendered HTML. Replacement body markup is trusted.',
  },
  'view.board-index': {
    kind: 'filter',
    purpose: 'The index page model.',
  },
  'view.forum-row': {
    kind: 'filter',
    purpose: 'Forum listing row. Runs once per row.',
  },
  'view.thread-row': {
    kind: 'filter',
    purpose: 'One thread row in a listing. Runs once per row.',
  },
  'view.post-bit': {
    kind: 'filter',
    purpose: 'Post model. Runs once per post on each thread page.',
  },
  'view.post-actions': {
    kind: 'filter',
    purpose: 'The per-post control links. Adding one here does not create permission to use it.',
  },
  'view.member-profile': {
    kind: 'filter',
    purpose: 'A member’s profile model, including its custom fields and action links.',
  },
  'view.board-stats': {
    kind: 'filter',
    purpose: 'The board totals block.',
  },
  'view.who-is-online': {
    kind: 'filter',
    purpose: 'The online list, already resolved against the reader.',
  },
  'view.latest-threads': {
    kind: 'filter',
    purpose: 'Latest threads panel. Runs on initial render and each live refresh.',
  },
  'view.latest-posts': {
    kind: 'filter',
    purpose: 'Latest posts panel. Runs on initial render and each live refresh.',
  },
  'view.pagination': {
    kind: 'filter',
    purpose: 'A resolved page-link window.',
  },
  'view.search-form': {
    kind: 'filter',
    purpose: 'The search form model, including its filter options.',
  },
  'view.search-results': {
    kind: 'filter',
    purpose:
      'Search results authorised for the viewer. Added rows require separate visibility checks.',
  },
  'view.discovery-view': {
    kind: 'filter',
    purpose:
      'Discovery listing and tabs. Existing rows are authorised; added rows require separate visibility checks.',
  },
  'view.auth-page': {
    kind: 'filter',
    purpose:
      'Sign-in, registration or password-reset page. The app supplies the form as a rendered region.',
  },
  'view.panel-shell': {
    kind: 'filter',
    purpose: 'Control panel frame and links. Adding links does not grant access.',
  },
  'view.panel-nav': {
    kind: 'filter',
    purpose: 'Control panel navigation with the current section. Runs on each panel page.',
  },
  'view.panel-page': {
    kind: 'filter',
    purpose: 'Control panel page heading. Runs on each panel page.',
  },
  'view.panel-section': {
    kind: 'filter',
    purpose: 'Panel section. Runs once per section.',
  },
  'view.error-notice': {
    kind: 'filter',
    purpose: 'Error page model.',
  },
  'view.shell': {
    kind: 'filter',
    purpose: 'Page frame. Runs on every page, including error pages.',
  },
  'view.notice': {
    kind: 'filter',
    purpose: 'A board notice or flash message, before the theme renders it.',
  },
  'view.category-block': {
    kind: 'filter',
    purpose: 'One category on the index, with its rendered forum rows.',
  },
  'view.subforum-list': {
    kind: 'filter',
    purpose: 'The compact child-forum list above a thread listing.',
  },
  'view.forum-display': {
    kind: 'filter',
    purpose: 'A forum page’s model, including its rendered regions.',
  },
  'view.thread-view': {
    kind: 'filter',
    purpose: 'A thread page’s model, including its rendered post list.',
  },
  'view.post-form': {
    kind: 'filter',
    purpose: 'The composer page’s model. The form itself is app-rendered and arrives as a region.',
  },
  'view.quick-reply': {
    kind: 'filter',
    purpose: 'Quick-reply model. The app supplies the reply form as `children`.',
  },
  'view.editor-toolbar': {
    kind: 'filter',
    purpose: 'The composer’s formatting-toolbar model — its buttons and the attachment picker.',
  },
  'view.redirect-notice': {
    kind: 'filter',
    purpose:
      'Post-mutation redirect notice. The target is checked again after filtering and must remain on the board.',
  },

  /* ---- Posting ---- */
  'thread.create.validate': {
    kind: 'filter',
    purpose: 'Validation messages for a new thread. Returning a non-empty list refuses the post.',
  },
  'thread.create.before': {
    kind: 'filter',
    purpose: 'The thread draft, before it is written. Subject, body, prefix, options.',
  },
  'thread.created': {
    kind: 'event',
    purpose: 'A thread was created and committed.',
  },
  'post.create.validate': {
    kind: 'filter',
    purpose: 'Validation messages for a reply.',
  },
  'post.create.before': {
    kind: 'filter',
    purpose: 'The reply draft, before it is written.',
  },
  'post.created': {
    kind: 'event',
    purpose: 'A reply was created and committed.',
  },
  'post.edit.before': {
    kind: 'filter',
    purpose: 'An edit’s new body and reason, before the revision is written.',
  },
  'post.edited': {
    kind: 'event',
    purpose: 'A post was edited and a revision recorded.',
  },
  'post.delete.before': {
    kind: 'event',
    purpose: 'Post scheduled for soft deletion. Cannot veto deletion.',
  },
  'post.deleted': {
    kind: 'event',
    purpose: 'A post was soft-deleted.',
  },
  'post.restored': {
    kind: 'event',
    purpose: 'A soft-deleted post was restored.',
  },
  'thread.moved': {
    kind: 'event',
    purpose: 'A thread changed forum. Carries both forum ids.',
  },
  'thread.merged': {
    kind: 'event',
    purpose: 'Two threads became one.',
  },
  'thread.split': {
    kind: 'event',
    purpose: 'Posts were split out into a new thread.',
  },
  'thread.locked': {
    kind: 'event',
    purpose: 'A thread was opened or closed.',
  },
  'thread.stickied': {
    kind: 'event',
    purpose: 'A thread was pinned or unpinned.',
  },
  'attachment.upload.validate': {
    kind: 'filter',
    purpose:
      'Upload validation after file-type checks. Can reject an accepted file; cannot accept a file rejected by core.',
  },
  'attachment.uploaded': {
    kind: 'event',
    purpose: 'Upload stored. Image processing may still be pending.',
  },
  'attachment.deleted': {
    kind: 'event',
    purpose: 'An attachment was removed, by a member or by the orphan sweep.',
  },
  'poll.created': {
    kind: 'event',
    purpose: 'A poll was attached to a thread.',
  },
  'poll.voted': {
    kind: 'event',
    purpose: 'Vote recorded. Runs for each chosen option, including replacement votes.',
  },
  'rating.recorded': {
    kind: 'event',
    purpose: 'A thread rating was recorded or changed.',
  },

  /* ---- Moderation ---- */
  'report.created': {
    kind: 'event',
    purpose: 'Report created.',
  },
  'report.resolved': {
    kind: 'event',
    purpose: 'A report was closed, with the resolution.',
  },
  'approval.queued': {
    kind: 'event',
    purpose: 'Content entered the approval queue.',
  },
  'approval.decided': {
    kind: 'event',
    purpose: 'Queued content was approved or rejected.',
  },
  'warning.issued': {
    kind: 'event',
    purpose: 'A warning was issued, with its points and expiry.',
  },
  'warning.revoked': {
    kind: 'event',
    purpose: 'A warning was revoked or expired.',
  },
  'moderation.logged': {
    kind: 'event',
    purpose: 'A moderation action was written to the log.',
  },

  /* ---- Identity ---- */
  'user.register.validate': {
    kind: 'filter',
    purpose: 'Registration validation messages. Use for additional questions or blocklists.',
  },
  'user.registered': {
    kind: 'event',
    purpose: 'An account was created, before or after activation depending on the mode.',
  },
  'user.activated': {
    kind: 'event',
    purpose: 'An account finished activation.',
  },
  'user.login.attempted': {
    kind: 'event',
    purpose: 'Sign-in attempt and outcome. Excludes passwords and session tokens.',
  },
  'user.logged-in': {
    kind: 'event',
    purpose: 'A session was established.',
  },
  'user.logged-out': {
    kind: 'event',
    purpose: 'A session was ended, by the member or by revocation.',
  },
  'user.banned': {
    kind: 'event',
    purpose: 'A member was banned, with the expiry when there is one.',
  },
  'user.unbanned': {
    kind: 'event',
    purpose: 'A ban was lifted or expired and the prior group restored.',
  },
  'user.groups.changed': {
    kind: 'event',
    purpose: 'Primary or secondary group membership changed.',
  },
  'user.profile.updated': {
    kind: 'event',
    purpose: 'A member saved profile or option changes.',
  },
  'user.merged': {
    kind: 'event',
    purpose: 'Account merge with retained and removed account IDs.',
  },
  'user.deleted': {
    kind: 'event',
    purpose: 'An account was pruned or deleted.',
  },

  /* ---- Mail, notifications, messages ---- */
  'notification.create.before': {
    kind: 'filter',
    purpose: 'A notification about to be created. Returning `null` suppresses it.',
  },
  'notification.created': {
    kind: 'event',
    purpose: 'A notification was stored.',
  },
  'mail.send.before': {
    kind: 'filter',
    purpose: 'Queued email before driver submission. Return `null` to suppress it.',
  },
  'mail.sent': {
    kind: 'event',
    purpose: 'A message was accepted by the driver. Not proof of delivery.',
  },
  'pm.send.before': {
    kind: 'filter',
    purpose: 'A private message, before it is stored.',
  },
  'pm.sent': {
    kind: 'event',
    purpose: 'A private message was delivered to its recipients’ folders.',
  },
  'subscription.changed': {
    kind: 'event',
    purpose: 'A member subscribed to or unsubscribed from a thread or forum.',
  },
  'reputation.changed': {
    kind: 'event',
    purpose: 'Reputation was given, changed or removed.',
  },

  /* ---- Search, discovery, syndication ---- */
  'search.query.before': {
    kind: 'filter',
    purpose: 'The parsed search terms, before the query runs. The scope is not filterable.',
  },
  'search.results': {
    kind: 'filter',
    purpose:
      'Search results authorised in SQL. Reorder or remove rows; check visibility before adding any.',
  },
  'feed.items': {
    kind: 'filter',
    purpose:
      'Feed entries after visibility filtering. May contain private member content; do not share entries between requests. Added rows require separate visibility checks.',
  },
  'sitemap.entries': {
    kind: 'filter',
    purpose: 'One chunk of the sitemap.',
  },
  'metadata.page': {
    kind: 'filter',
    purpose: 'Title, description and social card for a page.',
  },

  /* ---- Admin and system ---- */
  'admin.navigation': {
    kind: 'filter',
    purpose: 'The admin panel’s section links, so a plugin page can be reached.',
  },
  'settings.saved': {
    kind: 'event',
    purpose: 'Board settings changed. Carries the keys, never the values.',
  },
  'task.run.before': {
    kind: 'event',
    purpose: 'A scheduled task is about to run.',
  },
  'task.run.after': {
    kind: 'event',
    purpose: 'A scheduled task finished, with its outcome and duration.',
  },
  'cache.invalidated': {
    kind: 'event',
    purpose: 'A cache tag was invalidated.',
  },
  'plugin.enabled': {
    kind: 'event',
    purpose: 'Plugin enabled. Includes the enabled plugin itself.',
  },
  'plugin.disabled': {
    kind: 'event',
    purpose: 'Plugin disabled by an operator or after repeated failures, with the reason.',
  },
} as const satisfies Readonly<Record<string, HookSpec>>

/** Every hook name. Derived from the registry — never hand-written. */
export type HookName = keyof typeof HOOKS

/** The registry as an iterable list, in declaration order. */
export const HOOK_NAMES = Object.keys(HOOKS) as readonly HookName[]

/** Narrow an arbitrary string to a hook name. Used when validating a manifest. */
export function isHookName(value: string): value is HookName {
  return Object.hasOwn(HOOKS, value)
}

export function hookKind(name: HookName): HookKind {
  return HOOKS[name].kind
}
