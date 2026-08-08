/**
 * F79 — the hook registry.
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
 * community, and no amount of isolation makes that recoverable.
 */

export type HookKind = 'filter' | 'event'

export interface HookSpec {
  readonly kind: HookKind
  /** The plan feature whose code fires this hook. */
  readonly feature: string
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
    feature: 'F36',
    purpose: 'The raw Markdown source, before it is parsed. Last chance to rewrite input.',
  },
  'markdown.render.html': {
    kind: 'filter',
    feature: 'F36',
    purpose:
      'Rendered HTML, after the renderer has constructed it. Anything added here is ' +
      'trusted output and nothing escapes it afterwards.',
  },
  'markdown.directives': {
    kind: 'filter',
    feature: 'F37',
    purpose:
      'The declarative directive list, so a plugin can add a `:::name` block or ' +
      '`:name[…]` span without core changes.',
  },
  'post.body.html': {
    kind: 'filter',
    feature: 'F36',
    purpose: 'One post’s rendered body, in the context of the thread it is being read in.',
  },
  'signature.html': {
    kind: 'filter',
    feature: 'F58',
    purpose: 'A member’s rendered signature, wherever it appears.',
  },
  'smilies.list': {
    kind: 'filter',
    feature: 'F37',
    purpose: 'The smilie set offered by the editor and substituted at render.',
  },
  'word-filter.patterns': {
    kind: 'filter',
    feature: 'F71',
    purpose: 'The render-time word filter’s pattern list.',
  },

  /* ---- View models ---- */
  'view.header': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'The header model, before the theme renders it.',
  },
  'view.user-panel': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'The user panel model: greeting, counts, account links.',
  },
  'view.navigation': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'The breadcrumb trail.',
  },
  'view.footer': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'The footer model, including its link list.',
  },
  'view.community-jump': {
    kind: 'filter',
    feature: 'F27',
    purpose:
      'The jump box model. A plugin adding a destination must give it a real ' +
      'community id — the route re-authorises whatever is submitted.',
  },
  'view.announcement': {
    kind: 'filter',
    feature: 'F71',
    purpose:
      'One announcement, on its way to the theme. Its body is already rendered ' +
      'HTML from the board\u2019s own renderer, so a plugin replacing it is ' +
      'replacing trusted markup — the one hook where that is true of a body.',
  },
  'view.board-index': {
    kind: 'filter',
    feature: 'F29',
    purpose: 'The index page model.',
  },
  'view.community-row': {
    kind: 'filter',
    feature: 'F29',
    purpose: 'One community row in a listing. Runs once per row — keep it cheap.',
  },
  'view.thread-row': {
    kind: 'filter',
    feature: 'F30',
    purpose: 'One thread row in a listing. Runs once per row.',
  },
  'view.post-bit': {
    kind: 'filter',
    feature: 'F31',
    purpose:
      'One post as the theme will receive it. The busiest hook on the board: it ' +
      'runs once per post on every thread page.',
  },
  'view.post-actions': {
    kind: 'filter',
    feature: 'F31',
    purpose: 'The per-post control links. Adding one here does not create permission to use it.',
  },
  'view.member-profile': {
    kind: 'filter',
    feature: 'F33',
    purpose: 'A member’s profile model, including its custom fields and action links.',
  },
  'view.board-stats': {
    kind: 'filter',
    feature: 'F75',
    purpose: 'The board totals block.',
  },
  'view.who-is-online': {
    kind: 'filter',
    feature: 'F75',
    purpose: 'The online list, already resolved against the reader.',
  },
  'view.latest-threads': {
    kind: 'filter',
    feature: 'F29',
    purpose:
      'The index sidebar’s newest-threads panel. Runs again on every refresh ' +
      'of the live region, not only on the page load — keep it cheap.',
  },
  'view.latest-posts': {
    kind: 'filter',
    feature: 'F29',
    purpose: 'The index sidebar’s newest-posts panel. Same refresh cost as view.latest-threads.',
  },
  'view.pagination': {
    kind: 'filter',
    feature: 'F30',
    purpose: 'A resolved page-link window.',
  },
  'view.search-form': {
    kind: 'filter',
    feature: 'F73',
    purpose: 'The search form model, including its filter options.',
  },
  'view.error-notice': {
    kind: 'filter',
    feature: 'F34',
    purpose: 'The error page model. Runs on the page that renders when things are broken.',
  },
  'view.shell': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'The page frame’s model. Runs on every page including the error pages.',
  },
  'view.notice': {
    kind: 'filter',
    feature: 'F27',
    purpose: 'A board notice or flash message, before the theme renders it.',
  },
  'view.category-block': {
    kind: 'filter',
    feature: 'F29',
    purpose: 'One category on the index, with its rendered community rows.',
  },
  'view.subcommunity-list': {
    kind: 'filter',
    feature: 'F30',
    purpose: 'The compact child-community list above a thread listing.',
  },
  'view.community-display': {
    kind: 'filter',
    feature: 'F30',
    purpose: 'A community page’s model, including its rendered regions.',
  },
  'view.thread-view': {
    kind: 'filter',
    feature: 'F31',
    purpose: 'A thread page’s model, including its rendered post list.',
  },
  'view.post-form': {
    kind: 'filter',
    feature: 'F39',
    purpose: 'The composer page’s model. The form itself is app-rendered and arrives as a region.',
  },
  'view.redirect-notice': {
    kind: 'filter',
    feature: 'F34',
    purpose: 'The interstitial shown after a mutation, before the meta refresh fires.',
  },

  /* ---- Posting ---- */
  'thread.create.validate': {
    kind: 'filter',
    feature: 'F39',
    purpose: 'Validation messages for a new thread. Returning a non-empty list refuses the post.',
  },
  'thread.create.before': {
    kind: 'filter',
    feature: 'F39',
    purpose: 'The thread draft, before it is written. Subject, body, prefix, options.',
  },
  'thread.created': {
    kind: 'event',
    feature: 'F39',
    purpose: 'A thread was created and committed.',
  },
  'post.create.validate': {
    kind: 'filter',
    feature: 'F40',
    purpose: 'Validation messages for a reply.',
  },
  'post.create.before': {
    kind: 'filter',
    feature: 'F40',
    purpose: 'The reply draft, before it is written.',
  },
  'post.created': {
    kind: 'event',
    feature: 'F40',
    purpose: 'A reply was created and committed.',
  },
  'post.edit.before': {
    kind: 'filter',
    feature: 'F41',
    purpose: 'An edit’s new body and reason, before the revision is written.',
  },
  'post.edited': {
    kind: 'event',
    feature: 'F41',
    purpose: 'A post was edited and a revision recorded.',
  },
  'post.delete.before': {
    kind: 'event',
    feature: 'F41',
    purpose: 'A post is about to be soft-deleted. Observation only: refusing is a permission.',
  },
  'post.deleted': {
    kind: 'event',
    feature: 'F41',
    purpose: 'A post was soft-deleted.',
  },
  'post.restored': {
    kind: 'event',
    feature: 'F41',
    purpose: 'A soft-deleted post was restored.',
  },
  'thread.moved': {
    kind: 'event',
    feature: 'F50',
    purpose: 'A thread changed community. Carries both community ids.',
  },
  'thread.merged': {
    kind: 'event',
    feature: 'F51',
    purpose: 'Two threads became one.',
  },
  'thread.split': {
    kind: 'event',
    feature: 'F51',
    purpose: 'Posts were split out into a new thread.',
  },
  'thread.locked': {
    kind: 'event',
    feature: 'F50',
    purpose: 'A thread was opened or closed.',
  },
  'thread.stickied': {
    kind: 'event',
    feature: 'F50',
    purpose: 'A thread was pinned or unpinned.',
  },
  'attachment.upload.validate': {
    kind: 'filter',
    feature: 'F42',
    purpose:
      'Validation messages for an upload, after the magic-byte check. A plugin may ' +
      'refuse a file core would accept; it can never accept one core refused.',
  },
  'attachment.uploaded': {
    kind: 'event',
    feature: 'F42',
    purpose: 'A file finished uploading and re-encoding.',
  },
  'attachment.deleted': {
    kind: 'event',
    feature: 'F42',
    purpose: 'An attachment was removed, by a member or by the orphan sweep.',
  },
  'poll.created': {
    kind: 'event',
    feature: 'F43',
    purpose: 'A poll was attached to a thread.',
  },
  'poll.voted': {
    kind: 'event',
    feature: 'F43',
    purpose: 'A vote was cast. Fires once; the database enforces one per member.',
  },
  'rating.recorded': {
    kind: 'event',
    feature: 'F43',
    purpose: 'A thread rating was recorded or changed.',
  },

  /* ---- Moderation ---- */
  'report.created': {
    kind: 'event',
    feature: 'F49',
    purpose: 'Something was reported. The hook a notifier or a webhook wants.',
  },
  'report.resolved': {
    kind: 'event',
    feature: 'F49',
    purpose: 'A report was closed, with the resolution.',
  },
  'approval.queued': {
    kind: 'event',
    feature: 'F48',
    purpose: 'Content entered the approval queue.',
  },
  'approval.decided': {
    kind: 'event',
    feature: 'F48',
    purpose: 'Queued content was approved or rejected.',
  },
  'warning.issued': {
    kind: 'event',
    feature: 'F53',
    purpose: 'A warning was issued, with its points and expiry.',
  },
  'warning.revoked': {
    kind: 'event',
    feature: 'F53',
    purpose: 'A warning was revoked or expired.',
  },
  'moderation.logged': {
    kind: 'event',
    feature: 'F50',
    purpose: 'A moderation action was written to the log.',
  },

  /* ---- Identity ---- */
  'user.register.validate': {
    kind: 'filter',
    feature: 'F18',
    purpose:
      'Validation messages for a registration. Where a custom question or an ' +
      'external blocklist belongs.',
  },
  'user.registered': {
    kind: 'event',
    feature: 'F18',
    purpose: 'An account was created, before or after activation depending on the mode.',
  },
  'user.activated': {
    kind: 'event',
    feature: 'F18',
    purpose: 'An account finished activation.',
  },
  'user.login.attempted': {
    kind: 'event',
    feature: 'F19',
    purpose:
      'A sign-in was attempted, with the outcome. Never carries the password or the ' +
      'session token.',
  },
  'user.logged-in': {
    kind: 'event',
    feature: 'F19',
    purpose: 'A session was established.',
  },
  'user.logged-out': {
    kind: 'event',
    feature: 'F19',
    purpose: 'A session was ended, by the member or by revocation.',
  },
  'user.banned': {
    kind: 'event',
    feature: 'F23',
    purpose: 'A member was banned, with the expiry when there is one.',
  },
  'user.unbanned': {
    kind: 'event',
    feature: 'F23',
    purpose: 'A ban was lifted or expired and the prior group restored.',
  },
  'user.groups.changed': {
    kind: 'event',
    feature: 'F66',
    purpose: 'Primary or secondary group membership changed.',
  },
  'user.profile.updated': {
    kind: 'event',
    feature: 'F57',
    purpose: 'A member saved profile or option changes.',
  },
  'user.merged': {
    kind: 'event',
    feature: 'F67',
    purpose: 'Two accounts were merged. Carries the winner and the account that went.',
  },
  'user.deleted': {
    kind: 'event',
    feature: 'F67',
    purpose: 'An account was pruned or deleted.',
  },

  /* ---- Mail, notifications, messages ---- */
  'notification.create.before': {
    kind: 'filter',
    feature: 'F55',
    purpose: 'A notification about to be created. Returning `null` suppresses it.',
  },
  'notification.created': {
    kind: 'event',
    feature: 'F55',
    purpose: 'A notification was stored.',
  },
  'mail.send.before': {
    kind: 'filter',
    feature: 'F55',
    purpose:
      'A queued message, before it is handed to the mail driver. Subject, body and ' +
      'recipient; returning `null` drops it.',
  },
  'mail.sent': {
    kind: 'event',
    feature: 'F55',
    purpose: 'A message was accepted by the driver. Not proof of delivery.',
  },
  'pm.send.before': {
    kind: 'filter',
    feature: 'F60',
    purpose: 'A private message, before it is stored.',
  },
  'pm.sent': {
    kind: 'event',
    feature: 'F60',
    purpose: 'A private message was delivered to its recipients’ folders.',
  },
  'subscription.changed': {
    kind: 'event',
    feature: 'F56',
    purpose: 'A member subscribed to or unsubscribed from a thread or community.',
  },
  'reputation.changed': {
    kind: 'event',
    feature: 'F62',
    purpose: 'Reputation was given, changed or removed.',
  },

  /* ---- Search, discovery, syndication ---- */
  'search.query.before': {
    kind: 'filter',
    feature: 'F72',
    purpose: 'The parsed search terms, before the query runs. The scope is not filterable.',
  },
  'search.results': {
    kind: 'filter',
    feature: 'F72',
    purpose:
      'A page of results, already permission-filtered in SQL. A plugin may reorder or ' +
      'drop; adding a row here would add one the viewer may not see.',
  },
  'feed.items': {
    kind: 'filter',
    feature: 'F76',
    purpose: 'The items of a feed, rendered as a guest. Anything added is public.',
  },
  'sitemap.entries': {
    kind: 'filter',
    feature: 'F76',
    purpose: 'One chunk of the sitemap.',
  },
  'metadata.page': {
    kind: 'filter',
    feature: 'F76',
    purpose: 'Title, description and social card for a page.',
  },

  /* ---- Admin and system ---- */
  'admin.navigation': {
    kind: 'filter',
    feature: 'F63',
    purpose: 'The admin panel’s section links, so a plugin page can be reached.',
  },
  'settings.saved': {
    kind: 'event',
    feature: 'F64',
    purpose: 'Board settings changed. Carries the keys, never the values.',
  },
  'task.run.before': {
    kind: 'event',
    feature: 'F06',
    purpose: 'A scheduled task is about to run.',
  },
  'task.run.after': {
    kind: 'event',
    feature: 'F06',
    purpose: 'A scheduled task finished, with its outcome and duration.',
  },
  'cache.invalidated': {
    kind: 'event',
    feature: 'F10',
    purpose: 'A cache tag was invalidated.',
  },
  'plugin.enabled': {
    kind: 'event',
    feature: 'F79',
    purpose: 'A plugin was enabled — including this one, which is how it learns it is on.',
  },
  'plugin.disabled': {
    kind: 'event',
    feature: 'F79',
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
