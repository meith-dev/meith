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
 * registration order, never the order `community.config.ts` happens to list plugins
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
    purpose: 'The raw Markdown source, before it is parsed. Last chance to rewrite input.',
  },
  'markdown.render.html': {
    kind: 'filter',
    purpose:
      'Rendered HTML, after the renderer has constructed it. Anything added here is ' +
      'trusted output and nothing escapes it afterwards.',
  },
  'markdown.directives': {
    kind: 'filter',
    purpose:
      'The declarative directive list, so a plugin can add a `:::name` block or ' +
      '`:name[…]` span without core changes. Board-wide: rendered bodies are stored and shared, so the set cannot depend on who is reading.',
  },
  'post.body.html': {
    kind: 'filter',
    purpose: 'One post’s rendered body, in the context of the thread it is being read in.',
  },
  'signature.html': {
    kind: 'filter',
    purpose: 'A member’s rendered signature, wherever it appears.',
  },
  'smilies.list': {
    kind: 'filter',
    purpose:
      'The smilie set substituted at render. Board-wide, for the same reason ' +
      'the directive list is.',
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
      'The jump box model. A plugin adding a destination must give it a real ' +
      'forum id — the route re-authorises whatever is submitted.',
  },
  'view.announcement': {
    kind: 'filter',
    purpose:
      'One announcement, on its way to the theme. Its body is already rendered ' +
      'HTML from the board\u2019s own renderer, so a plugin replacing it is ' +
      'replacing trusted markup — the one hook where that is true of a body.',
  },
  'view.board-index': {
    kind: 'filter',
    purpose: 'The index page model.',
  },
  'view.forum-row': {
    kind: 'filter',
    purpose: 'One forum row in a listing. Runs once per row — keep it cheap.',
  },
  'view.thread-row': {
    kind: 'filter',
    purpose: 'One thread row in a listing. Runs once per row.',
  },
  'view.post-bit': {
    kind: 'filter',
    purpose:
      'One post as the theme will receive it. The busiest hook on the board: it ' +
      'runs once per post on every thread page.',
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
    purpose:
      'The index sidebar’s newest-threads panel. Runs again on every refresh ' +
      'of the live region, not only on the page load — keep it cheap.',
  },
  'view.latest-posts': {
    kind: 'filter',
    purpose: 'The index sidebar’s newest-posts panel. Same refresh cost as view.latest-threads.',
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
      'One page of search results. Already checked against the reader — a hit ' +
      'a plugin adds here has not been, and will be shown to whoever asked.',
  },
  'view.discovery-view': {
    kind: 'filter',
    purpose:
      'A discovery listing — new posts, today, unanswered — with its tabs. ' +
      'Same warning as the search results: the rows arrive authorised.',
  },
  'view.auth-page': {
    kind: 'filter',
    purpose:
      'The sign-in, register and password-reset page around its form. The form ' +
      'itself is a region, not a value: nothing here can change what it posts to.',
  },
  'view.panel-shell': {
    kind: 'filter',
    purpose:
      'The frame around a control panel, including the links to the other ' +
      'panels this viewer may reach. Adding a link grants nothing.',
  },
  'view.panel-nav': {
    kind: 'filter',
    purpose:
      'A control panel’s section rail, with the current section already ' +
      'resolved. Runs on every panel page.',
  },
  'view.panel-page': {
    kind: 'filter',
    purpose: 'One control-panel page’s heading block. Runs on every panel page.',
  },
  'view.panel-section': {
    kind: 'filter',
    purpose: 'One labelled section inside a panel page. Runs once per section.',
  },
  'view.error-notice': {
    kind: 'filter',
    purpose: 'The error page model. Runs on the page that renders when things are broken.',
  },
  'view.shell': {
    kind: 'filter',
    purpose: 'The page frame’s model. Runs on every page including the error pages.',
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
    purpose:
      'The quick-reply island’s model, at the foot of a thread. The reply form itself is ' +
      'app-rendered and arrives as `children`.',
  },
  'view.editor-toolbar': {
    kind: 'filter',
    purpose: 'The composer’s formatting-toolbar model — its buttons and the attachment picker.',
  },
  'view.redirect-notice': {
    kind: 'filter',
    purpose:
      'The interstitial shown after a mutation, before the meta refresh fires. The target is re-checked against the board after the filter runs, so this ' +
      'cannot send a member off-site.',
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
    purpose: 'A post is about to be soft-deleted. Observation only: refusing is a permission.',
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
      'Validation messages for an upload, after the magic-byte check. A plugin may ' +
      'refuse a file core would accept; it can never accept one core refused.',
  },
  'attachment.uploaded': {
    kind: 'event',
    purpose: 'A file finished uploading and re-encoding.',
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
    purpose:
      'A vote was cast, once per option chosen. It fires again when a poll that allows ' +
      're-voting takes a replacement.',
  },
  'rating.recorded': {
    kind: 'event',
    purpose: 'A thread rating was recorded or changed.',
  },

  /* ---- Moderation ---- */
  'report.created': {
    kind: 'event',
    purpose: 'Something was reported. The hook a notifier or a webhook wants.',
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
    purpose:
      'Validation messages for a registration. Where a custom question or an ' +
      'external blocklist belongs.',
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
    purpose:
      'A sign-in was attempted, with the outcome. Never carries the password or the ' +
      'session token.',
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
    purpose: 'Two accounts were merged. Carries the winner and the account that went.',
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
    purpose:
      'A queued message, before it is handed to the mail driver. Subject, body and ' +
      'recipient; returning `null` drops it.',
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
      'A page of results, already permission-filtered in SQL. A plugin may reorder or ' +
      'drop; adding a row here would add one the viewer may not see.',
  },
  'feed.items': {
    kind: 'filter',
    purpose: 'The items of a feed, rendered as a guest. Anything added is public.',
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
    purpose: 'A plugin was enabled — including this one, which is how it learns it is on.',
  },
  'plugin.disabled': {
    kind: 'event',
    purpose:
      'A plugin was disabled, by an operator or by the host after repeated failures. ' +
      'Carries the reason.',
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
