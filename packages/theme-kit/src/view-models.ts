/**
 * The view models slots are handed, and the rule they all obey.
 *
 * These types are the **public API for themes**. Per docs/nextjs-conventions.md
 * adding a field is a minor change; renaming or removing one needs a deprecation
 * cycle. The theme-kit slot contract freezes them.
 *
 * ## The rule: view models are plain JSON-shaped data
 *
 * No `Date`, no `Map`/`Set`, no class instances, no functions. Not because
 * React's Flight protocol cannot carry them — React 19 can serialise a `Date`
 * perfectly well — but because a view model has three consumers and only the
 * JSON subset survives all three:
 *
 *  1. a **server slot**, which renders it;
 *  2. a **client slot**, across the RSC boundary;
 *  3. the **public REST API**, which returns view models as JSON.
 *
 * A `Date` also pushes formatting into every theme, and formatting a date is
 * timezone- and locale-dependent: the server does not know the viewer's zone,
 * so a theme calling `toLocaleString()` renders one string on the server and a
 * different one in the browser — a hydration mismatch that appears only for
 * users outside the server's timezone. So a timestamp crosses as `TimeModel`:
 * the machine value for `<time datetime>`, and the string the app already
 * formatted using the viewer's stored zone.
 *
 * The rule is not a convention. `_PlainDataCheck` below is a compile-time proof
 * over every model in this file, and `view-models.type-test.ts` proves the proof
 * still has teeth.
 *
 * **Field-level scope.** These models carry what Phases 2–3 render. They are
 * deliberately narrow: a field added later is additive, whereas a field invented
 * now to seem complete is a guess that themes will have written markup against
 * by the time it turns out to be wrong.
 */

import type { ReactNode } from 'react'

import type { SlotName } from './slots'

/* ------------------------------------------------------------------ *
 * The plain-data constraint
 * ------------------------------------------------------------------ */

/**
 * `T` with everything that is not JSON-shaped mapped to `never`.
 *
 * Used as a *predicate*, not a transform: if `T` is already plain data then
 * `Serialisable<T>` equals `T` and `T extends Serialisable<T>` holds. If any
 * field is a `Date`, a function, a `Map` or a `Promise`, that field becomes
 * `never` and the assignment fails, naming the offending model.
 *
 * **`Date`, `Map`, `Set`, `RegExp` and `Promise` are all rejected** — by the
 * function clause, not by a clause of their own. Every one of them exposes its
 * entire API as methods, so mapping it produces an object whose members are
 * `never` and the assignment fails. An explicit branch naming those five was
 * written first and then deleted: no mutation could make it matter, and a clause
 * no test can kill is a clause that will quietly stop being true.
 *
 * **Limit, stated plainly:** a class instance with only data fields is
 * structurally indistinguishable from a plain object, so this cannot catch one.
 */
export type Serialisable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer E)[]
    ? readonly Serialisable<E>[]
    : // Functions before objects: a function *is* an object.
      T extends (...args: never[]) => unknown
      ? never
      : T extends object
        ? { readonly [K in keyof T]: Serialisable<T[K]> }
        : // bigint, symbol: not JSON.
          never

/**
 * Two keys are exempt — `children` and `regions` — and nothing else.
 *
 * A `ReactNode` is not plain data, but passing rendered children through a
 * component is a first-class React capability rather than a loophole: the parent
 * renders the tree and the RSC boundary carries it.
 *
 * ## Why `regions` exists at all: slots are flat
 *
 * **A slot never renders another slot.** `ThreadView` does not call `PostBit`;
 * the page does, and hands `ThreadView` the rendered list. The reason is
 * mechanical: rendering a slot requires the *resolved theme*, and there is no way
 * to get one inside a slot — React Context is not available to Server
 * Components, and threading the theme through props would put a map of functions
 * into a contract whose whole point is that it holds none.
 *
 * It also keeps inheritance honest. If `ThreadView` imported `PostBit` directly,
 * a child theme overriding `PostBit` would be ignored inside the parent's
 * `ThreadView` — inheritance that works for some slots and silently not others.
 * With composition in the page, exactly one place resolves slots, so an override
 * applies everywhere.
 *
 * A container therefore declares its nested regions as `ReactNode` under
 * `regions`, and the page fills them. The cost, stated: a theme can restyle
 * within a region and re-order the regions it is given, but cannot invent a new
 * relationship between two slots — for that it overrides the container and the
 * page composition stays as it is. This is revisited if a real theme needs more.
 */
type ModelData<T> = Omit<T, 'children' | 'regions'>

type IsPlainData<T> = ModelData<T> extends Serialisable<ModelData<T>> ? true : false

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/** A timestamp, in both forms a template needs. See this file's header. */
export interface TimeModel {
  /** ISO-8601 UTC. Goes in `<time datetime>`; never rendered raw. */
  readonly iso: string
  /** Preformatted in the viewer's timezone, e.g. "Today, 09:14" or "12 Mar 2026". */
  readonly label: string
}

/** A resolved link. Themes never build hrefs; the app owns URL shape. */
export interface LinkModel {
  readonly label: string
  readonly href: string
  /**
   * Which run of links this one belongs to, for themes that separate them.
   *
   * Compare it for *change*, never for value: a theme draws a rule wherever
   * consecutive links disagree, and the strings themselves stay the app's
   * business. Absent everywhere is the normal case and renders as one run.
   */
  readonly group?: string
}

/** Who is looking. The only actor data a theme is given. */
export interface ViewerModel {
  readonly isGuest: boolean
  /** `null` for a guest. */
  readonly userId: number | null
  readonly username: string | null
  readonly profileHref: string | null
  readonly avatarUrl: string | null
  /**
   * Whether to render the admin-panel link. A *rendering* hint, resolved by the
   * Authorizer already — a theme must never conclude anything about permissions
   * on its own, and themes stay out of authorization entirely.
   */
  readonly canAccessAdminCp: boolean
  /**
   * Whether to render the moderation link. Same shape and same rule as
   * `canAccessAdminCp`: a rendering hint the Authorizer has already decided.
   *
   * Group-level only, which is a real limitation rather than an oversight: a
   * per-forum appointee's queue exists and is reachable, but answering "does
   * this person moderate anything" for them costs the tree, and the shell
   * renders on every page. The moderation control panel is where that link earns its query.
   */
  readonly canAccessModCp: boolean
}

/** A user as they appear attached to content. */
export interface UserRefModel {
  /** `null` when the account was deleted; `username` is still shown. */
  readonly userId: number | null
  readonly username: string
  readonly profileHref: string | null
  /**
   * A class carrying this member's group colour, or `null` for most members.
   *
   * **A theme should put this on whatever renders the name**, wherever a name
   * appears. It is a class rather than a colour because the value has to differ
   * between light and dark, and a `style` attribute cannot hold two answers — a
   * reader on "system" has no `.dark` class at all, so the only place both can
   * live is the stylesheet the app emits into `<head>`.
   *
   * A theme that ignores it renders the name in the ordinary text colour and is
   * still correct, which is what makes the field additive. It will simply not
   * show the board's own hierarchy, which most boards will notice.
   */
  readonly nameClass?: string | null | undefined
}

/** The last post in a forum or thread, as a listing shows it. */
export interface LastPostModel {
  readonly threadTitle: string
  /** Deep link to the post itself, not the thread's first page. */
  readonly href: string
  readonly author: UserRefModel
  readonly at: TimeModel
}

/** A thread prefix; `token` supplies its styling. */
export interface PrefixModel {
  readonly label: string
  readonly token: string | null
}

/**
 * One choice in a `<select>` or a radio group, with the current one marked.
 *
 * `isSelected` rather than a separate `selected` field on the parent: a theme
 * renders options in a loop, and "which of these is current" answered per option
 * is one comparison the theme does not have to write — and cannot write wrongly
 * by comparing a string to a number.
 */
export interface OptionModel {
  /** Submitted as the form value. Opaque to the theme. */
  readonly value: string
  readonly label: string
  readonly isSelected: boolean
}

/* ------------------------------------------------------------------ *
 * Listing models
 * ------------------------------------------------------------------ */

export interface ForumRowModel {
  readonly id: number
  readonly title: string
  readonly description: string | null
  readonly href: string
  /** `link` rows navigate away and have no counters. */
  readonly type: 'category' | 'forum' | 'link'
  readonly threadCount: number
  readonly postCount: number
  readonly lastPost: LastPostModel | null
  /** `false` for a guest, who has no read state. */
  readonly isUnread: boolean
  readonly subforums: readonly LinkModel[]
}

export interface ThreadRowModel {
  readonly id: number
  readonly title: string
  readonly href: string
  readonly prefix: PrefixModel | null
  readonly author: UserRefModel
  readonly replyCount: number
  readonly viewCount: number
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly isUnread: boolean
  /** Set when the thread is a move stub; the row renders as a redirect. */
  readonly isMoved: boolean
  readonly lastPost: LastPostModel | null
}

/**
 * Paging, fully resolved.
 *
 * The obvious API — a page count plus a function to build an href — is
 * impossible here, and that is the constraint doing its job: a function cannot
 * cross to a client slot or into an API response. The app resolves the window
 * and hands over links, which also means paging is plain anchors and therefore
 * works with JavaScript disabled.
 */
export interface PaginationModel {
  readonly page: number
  readonly pageCount: number
  readonly pages: readonly {
    readonly page: number
    readonly href: string
    readonly isCurrent: boolean
  }[]
  readonly previousHref: string | null
  readonly nextHref: string | null
}

/* ------------------------------------------------------------------ *
 * Post models
 * ------------------------------------------------------------------ */

/** The author block beside a post. */
export interface PostAuthorModel extends UserRefModel {
  readonly avatarUrl: string | null
  /**
   * The display group's title, or a custom user title.
   *
   * Was `null` on every post the board has ever rendered — the field was in the
   * contract from the start and nothing populated it, so every theme's postbit
   * had a place for a member's standing and nothing to put in it. It comes from
   * `users.display_group_id`, falling back to the primary group.
   */
  readonly title: string | null
  /**
   * The board's badge for this member's group, or `null`.
   *
   * Shaped exactly like `LogoModel` and for the same reason: the app has
   * already chosen which of the two images this reader gets, so `darkSrc` is
   * non-null only for a reader on "system", where the server cannot know.
   */
  readonly badge?: LogoModel | null | undefined
  /**
   * This member's reputation, or `null` when the board has it switched off.
   *
   * A denormalised counter on `users`, so it costs the postbit nothing.
   */
  readonly reputation?: number | null | undefined
  readonly postCount: number
  readonly joinedAt: TimeModel | null
  /** Pre-rendered Markdown. Trusted output of the board's own renderer. */
  readonly signatureHtml: string | null
  readonly isOnline: boolean
  /**
   * Custom profile fields, for the ones an operator marked for the postbit and
   * this viewer may see.
   *
   * The same `{label, value}` shape `MemberProfileModel.fields` uses, and
   * **plain text** for the same reason: it is rendered as text by the theme,
   * and a field that could carry markup is stored XSS on the board's heaviest
   * page. Empty on a board with no custom fields, which is most of them.
   */
  readonly fields: readonly { readonly label: string; readonly value: string }[]
}

export interface PostActionsModel {
  readonly quoteHref: string | null
  readonly editHref: string | null
  /**
   * Where a soft-deleted post is put back.
   *
   * A separate field rather than a second meaning for `editHref`, because the
   * two are never both offered: a deleted post cannot be edited, and a visible
   * one has nothing to restore. A theme that renders both gets exactly one.
   */
  readonly restoreHref: string | null
  readonly reportHref: string | null
  /**
   * Warn this post's author, citing this post.
   *
   * Present for moderators only, and `null` for a post whose author is the
   * viewer or a deleted account. Separate from `moderateHref` because a warning
   * is aimed at the *person* and the post is only the evidence — which is also
   * why the link carries the post id rather than living on the post's own
   * moderation controls.
   */
  readonly warnHref: string | null
  /**
   * Reserved for per-post moderation controls that are not inline.
   *
   * Still `null` everywhere: per-post moderation is on checkboxes and a
   * bar rather than a per-post link, so nothing fills this yet. It stays in the
   * contract because the moderation control panel is where such a *page* would
   * live, and removing a public field to add it back next feature is worse
   * than a documented `null`.
   */
  readonly moderateHref: string | null
  /**
   * Rate this post's author, for this post.
   *
   * Null on your own post, on a board with reputation off, and for anybody
   * without the permission. It carries the post so the rating is attached to
   * *this* post rather than to the author generally — which is what makes one
   * rating per post a meaningful rule.
   */
  readonly rateHref: string | null
}

export interface PostBitModel {
  readonly id: number
  /** Position within the thread, 1-based. What "#12" in the corner means. */
  readonly number: number
  /** `/thread/12-slug#post-3` — anchored by `number`, so the link says what the corner says. */
  readonly permalink: string
  readonly author: PostAuthorModel
  /** Pre-rendered Markdown. */
  readonly bodyHtml: string
  /**
   * @deprecated Since theme API 1.4, removed in 2.0. Use `post.id`.
   *
   * It existed so the client could assemble a quote out of the page. Quoting
   * asks the server for a post **by id** now, which re-checks who may see it
   * and cannot hand back what a deleted post used to say — so this is a copy of
   * every post's source in the HTML of every thread page, for nobody. Still
   * populated, because a theme could have read it; see `DEPRECATIONS`.
   */
  readonly quoteSource: string
  readonly postedAt: TimeModel
  /** "Last edited by X on Y", already assembled, or `null`. */
  readonly editedNote: string | null
  readonly isFirstPost: boolean
  /** A moderator sees deleted and unapproved posts, marked as such. */
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  /**
   * Set when this viewer ignores the author and has not revealed this
   * post; `null` otherwise, which is the case on almost every post.
   *
   * The body is **withheld server-side** when this is set — `bodyHtml` is
   * empty, the signature and custom fields are gone — rather than hidden with
   * CSS, because "ignored" that ships the text to the browser is a preference
   * rather than a feature. The post keeps its place and its number: filtering
   * it out would give every viewer a different page size and make "#12" mean
   * different posts to different people.
   *
   * A theme renders the placeholder and the link. Both are required — a hidden
   * post with no way to see it is a hole in a conversation.
   */
  readonly ignored: {
    readonly authorUsername: string
    /** Same page, this post revealed. A GET: revealing changes nothing. */
    readonly revealHref: string
  } | null
  /**
   * The files attached to this post.
   *
   * Empty on almost every post, and empty rather than absent so a theme has one
   * shape to render. **Every entry is already downloadable**: a `pending`
   * upload — one whose re-encode has not finished — and a failed one are not in
   * this list, because a link to a file that is not there yet is worse than the
   * file appearing a minute later.
   *
   * `thumbnailHref` is `null` for anything that is not an image, and for an
   * image small enough that a thumbnail would be the same picture again. A
   * theme showing an image inline uses `thumbnailHref ?? href` and gets the
   * right answer in both cases.
   */
  readonly attachments: readonly PostAttachmentModel[]
  readonly actions: PostActionsModel
}

/** One file attached to a post. */
export interface PostAttachmentModel {
  readonly id: number
  /** Sanitised, and always ending in the extension the *bytes* imply. */
  readonly filename: string
  /** Already formatted — "1.4 MB" — because a theme is not a unit converter. */
  readonly size: string
  /** Whether the board is willing to show this inline rather than link it. */
  readonly isImage: boolean
  /** The download. Permission is re-checked on every fetch. */
  readonly href: string
  readonly thumbnailHref: string | null
  readonly width: number | null
  readonly height: number | null
}

/* ------------------------------------------------------------------ *
 * Per-slot models
 * ------------------------------------------------------------------ */

/**
 * The page frame. Receives everything else as `children` — the header, the
 * notices, the page body and the footer are separate slots the page composes, per
 * the flat-composition rule above.
 */
export interface ShellModel {
  readonly boardTitle: string
  readonly viewer: ViewerModel
  readonly children?: ReactNode
}

/** `children` is the user panel, so a theme decides where in the header it sits. */
/**
 * A board's logo, already resolved for this reader's colour scheme.
 *
 * Optional, and absent on most boards: a board with no logo renders its name in
 * text, which is what every board did before this field existed.
 *
 * **The app resolves the scheme, not the theme.** A theme cannot do it, and the
 * obvious attempt is wrong in the commonest case: `dark:hidden` matches the
 * `.dark` class, and a reader who has chosen "system" has no class — their dark
 * mode comes from a media query. They would get the light logo on a black page,
 * which is the exact failure two images exist to prevent. The server knows the
 * answer, so it gives one.
 */
export interface LogoModel {
  /** The image to render. Already the right one for a forced colour scheme. */
  readonly src: string
  /**
   * A dark-scheme source, or `null`.
   *
   * Non-null means "wrap it in a `<picture>` and put this behind
   * `(prefers-color-scheme: dark)`" — the reader is on "system" and has two
   * images to choose between. Null covers three different situations a theme
   * does not need to tell apart: one image, or a reader who has forced a
   * scheme, in which case `src` is already the right one.
   */
  readonly darkSrc: string | null
  /** Never empty — the board's name when the operator has set nothing. */
  readonly alt: string
}

export interface HeaderModel {
  readonly boardTitle: string
  readonly homeHref: string
  readonly viewer: ViewerModel
  readonly navigation: readonly LinkModel[]
  /**
   * The board's logo, when it has one.
   *
   * A theme that ignores this renders the board's name and is still correct —
   * which is what makes the field additive rather than breaking. A theme that
   * uses it should keep the name as the link's accessible content when there is
   * no logo, because the header is the only link home on most pages.
   */
  readonly logo?: LogoModel | undefined
  readonly children?: ReactNode
}

export interface UserPanelModel {
  readonly viewer: ViewerModel
  /** Sign-in / register, or account links. Resolved by the app. */
  readonly links: readonly LinkModel[]
  /** `0` when there is nothing to show. */
  readonly unreadNotifications: number
  readonly unreadMessages: number
  /**
   * Where the two counts above lead, so a theme can make them clickable.
   *
   * A count that cannot be acted on is a notification the reader has to go
   * hunting for. Both are absent for a guest, who has neither. Themes read
   * these rather than searching `links` for the one labelled "Notifications",
   * which two of them were doing and which breaks the moment that label is
   * reworded or translated.
   */
  readonly notificationsHref?: string
  readonly messagesHref?: string
  /**
   * Account controls the app supplies — today, the log-out form.
   *
   * Log out cannot be a `LinkModel`: it is a POST to a Server Action, because a
   * GET that ends a session is fired by every prefetcher and link scanner that
   * touches the page. A Server Action reference is also not plain data and could
   * never cross this contract, so the app renders the form and the theme decides
   * where in the panel it sits.
   */
  readonly children?: ReactNode
}

export interface NavigationModel {
  readonly items: readonly LinkModel[]
}

export interface FooterModel {
  readonly boardTitle: string
  readonly links: readonly LinkModel[]
  /** Which zone `TimeModel.label`s were formatted in, for the footer note. */
  readonly timezoneLabel: string
  /**
   * What the board runs on, and where to read about it (0.8).
   *
   * A `LinkModel` and not a hardcoded string in each theme, for the reason every
   * other piece of footer text is one: the app owns the words and the URL, so
   * they are written once and a theme that wants to place the attribution
   * somewhere else in its layout can, without owning a copy of them.
   *
   * Optional, which is what makes it a minor rather than a major: a theme
   * written against 0.7 compiles and runs unchanged, and simply does not render
   * it. The two themes in this repository do.
   */
  readonly poweredBy?: LinkModel
}

export interface NoticeModel {
  readonly kind: 'info' | 'success' | 'warning' | 'error'
  readonly message: string
  readonly dismissHref: string | null
}

/**
 * One announcement.
 *
 * **Not a `NoticeModel`, and the two are worth telling apart.** A notice is a
 * flash — the result of what the viewer just did, gone on the next page. An
 * announcement is a dated, authored, board-wide statement that is there for
 * everybody until it expires. They look similar and behave nothing alike, so
 * styling them identically is a choice a theme should make on purpose rather
 * than one the contract makes for it.
 */
export interface AnnouncementModel {
  readonly title: string
  /**
   * Trusted HTML, from `@meith/markdown`'s own renderer — the same contract as a
   * post body, and the reason a theme inserts it rather than escaping it.
   */
  readonly bodyHtml: string
  readonly postedBy: UserRefModel | null
  readonly postedAt: TimeModel
  /** The forum it belongs to, or `null` when it is board-wide. */
  readonly forum: LinkModel | null
}

export interface BoardIndexModel {
  /** The "mark all read" target — a form target, not a client handler. */
  readonly markAllReadAction: string | null
  readonly regions: {
    /** One `CategoryBlock` per top-level category, already rendered. */
    readonly categories: ReactNode
    readonly stats: ReactNode
    readonly online: ReactNode
    /**
     * The self-refreshing pair: newest threads and newest posts, already
     * rendered, or absent on a board that cannot answer either question.
     *
     * **One region rather than two, and that is the contract rather than a
     * convenience.** The pair is refreshed by a single round trip while the page
     * is open, so it arrives as one node; two regions would be two polls of the
     * same board for the same reason, or one poll that could only update half of
     * what a theme had placed. A theme places it — the default puts it at the
     * top of a sidebar — but does not take it apart.
     *
     * Optional, so a theme written against an earlier minor compiles and simply
     * does not show it. Same rule as every other region field here.
     */
    readonly latest?: ReactNode
    /**
     * The `index.footer` region: whatever plugins contributed, already
     * rendered and ordered by the host.
     *
     * Optional, which is what makes this a **minor** addition under the
     * versioning policy — a theme written against 0.1 keeps compiling and simply
     * does not render plugin output. Every region field below follows the same rule.
     */
    readonly plugins?: ReactNode
    /**
     * Live announcements, already rendered — one `Announcement` per row,
     * or absent when there are none.
     *
     * Optional for the same reason the plugin region is, and under the same
     * policy: a theme written against an earlier minor compiles and simply does
     * not show them.
     */
    readonly announcements?: ReactNode
  }
}

/** A category and the forum rows under it; the rows arrive as `children`. */
export interface CategoryBlockModel {
  readonly category: ForumRowModel
  readonly children?: ReactNode
}

export interface BoardStatsModel {
  readonly threadCount: number
  readonly postCount: number
  readonly memberCount: number
  readonly newestMember: UserRefModel | null
  /**
   * When the totals were last rolled up, or null before the first run.
   *
   * Part of the contract rather than a detail the app hides, because a theme
   * that shows the numbers should be able to say how old they are — and
   * "computed ten minutes ago" is the difference between a number that is
   * stale and one that is wrong.
   */
  readonly computedAt: TimeModel | null
}

/**
 * One visitor in the online list.
 *
 * `location` is **already resolved against the reader**: a forum they may not
 * see arrives as the bare label, never as a title with a link. The theme
 * renders what it is given and cannot leak what it was not.
 */
export interface OnlineMemberModel extends UserRefModel {
  /** Where they are, as this reader may be told. Never null — see `label`. */
  readonly location: { readonly label: string; readonly href: string | null }
  /** True only for staff, who see hidden members marked rather than absent. */
  readonly isInvisible: boolean
  readonly lastSeen: TimeModel
}

export interface WhoIsOnlineModel {
  readonly guestCount: number
  readonly members: readonly OnlineMemberModel[]
  /** Members plus guests, as this reader is permitted to count them. */
  readonly total: number
  readonly recordCount: number
  readonly recordAt: TimeModel | null
  /** The full list, for a theme that shows only a summary here. */
  readonly fullListHref: string
}

/**
 * One thread in the index's "latest threads" panel.
 *
 * Every row carries its forum, because these two panels are the only lists on
 * the board that cross it: without the forum, two identically-titled threads in
 * two forums are the same row printed twice.
 */
export interface LatestThreadModel {
  readonly title: string
  readonly href: string
  /** The forum it was started in, resolved — a theme never builds an href. */
  readonly forum: LinkModel
  readonly author: UserRefModel
  readonly replyCount: number
  readonly startedAt: TimeModel
}

/**
 * The newest threads on the board.
 *
 * `capturedAt` is not decoration. This panel refreshes itself while somebody is
 * looking at it, and a list that changes with nothing saying when it was read is
 * a list nobody can tell apart from one that has frozen. It is the same
 * argument `BoardStatsModel.computedAt` makes about a rollup, applied to the
 * opposite problem: that one is old and says so, this one is new and says so.
 */
export interface LatestThreadsModel {
  readonly threads: readonly LatestThreadModel[]
  readonly capturedAt: TimeModel
}

/** One post in the index's "latest posts" panel. */
export interface LatestPostModel {
  /** The thread it is in. A post has no title of its own. */
  readonly threadTitle: string
  /** `/thread/12-slug?post=34` — the post, not the top of its thread. */
  readonly href: string
  readonly forum: LinkModel
  readonly author: UserRefModel
  /**
   * The post as text: flattened out of its Markdown source and cut on a word
   * boundary, the same way a feed entry's summary is.
   *
   * Flattened rather than rendered, because the board's HTML carries quotes,
   * directives and attachment markup whose meaning is lost in two lines — and
   * because a theme dropping raw post HTML into a sidebar is one plugin away
   * from being an injection point.
   */
  readonly excerpt: string
  readonly postedAt: TimeModel
}

/** The newest posts on the board. See `LatestThreadsModel` for `capturedAt`. */
export interface LatestPostsModel {
  readonly posts: readonly LatestPostModel[]
  readonly capturedAt: TimeModel
}

export interface ForumDisplayModel {
  readonly forum: ForumRowModel
  readonly newThreadHref: string | null
  readonly markReadAction: string | null
  readonly regions: {
    /**
     * Controls scoped to this forum — the thread ordering, and the follow
     * form for a member who may subscribe. Rendered by the route because both
     * carry a Server Action or a URL contract the theme does not own.
     *
     * **A theme renders this under its heading, not above it.** That placement
     * is the reason the field exists: these were app-rendered strips stacked
     * *before* `ForumDisplay`, so the first thing on a forum page was a filter
     * with nothing yet to say what it filtered. A control belongs after the
     * thing it acts on has been named.
     *
     * Optional, which is what makes it a **minor** addition under the
     * versioning policy — a theme written against 0.3 keeps compiling.
     *
     * Only what acts on the listing *below* it belongs here. Following the
     * forum is in `afterContent`, for the reason given there.
     */
    readonly tools?: ReactNode
    readonly subforums: ReactNode
    /** One `ThreadRow` per thread. Empty-state markup is the theme's. */
    readonly threads: ReactNode
    readonly pagination: ReactNode
    /**
     * This forum's announcements *and* the board's — an announcement being
     * board-wide would mean little if it appeared only on the index, which is
     * the page fewest people arrive on.
     */
    readonly announcements?: ReactNode
    /**
     * Controls for somebody who has finished with the page — today, the form
     * that follows this forum.
     *
     * A theme renders it after the listing. "Do you want to hear about this
     * forum?" is a question you can only answer once you have seen what is in
     * it, and asked above the threads it is a panel between a reader and the
     * thing they came for. The ordering tabs stay at the top in `tools`,
     * because those act on the list underneath them.
     */
    readonly afterContent?: ReactNode
  }
}

export interface SubforumListModel {
  readonly forums: readonly ForumRowModel[]
}

export interface ThreadViewModel {
  readonly thread: ThreadRowModel
  readonly forum: LinkModel
  readonly replyHref: string | null
  /** A native POST target for the last visible post on this page. */
  readonly markReadAction: string | null
  readonly regions: {
    /**
     * Controls scoped to this thread — following it, rating it, its poll, and
     * the moderator's thread tools. Rendered by the route, for the reason
     * every app-rendered region exists: each one carries a Server Action.
     *
     * **A theme renders this under its heading, not above it**, and the same
     * history is behind this field as behind `ForumDisplayModel`'s. Four of
     * these strips used to stack before `ThreadView`, so a thread opened on a
     * phone began with a follow control, a star rating and a poll, and the
     * title of the thing being followed, rated and voted on was a screen
     * further down.
     *
     * Only what belongs *before* the posts: the moderator's bar, and the
     * poll, which is content rather than a control. Rating and following are
     * in `afterContent`.
     *
     * Optional under the versioning policy: a theme written against 0.3 compiles
     * and simply does not offer them.
     */
    readonly tools?: ReactNode
    /** One `PostBit` per post on this page. */
    readonly posts: ReactNode
    readonly pagination: ReactNode
    /**
     * Controls for a reader who has reached the end — rating the thread, and
     * following it.
     *
     * A theme renders it after the posts and **before** the quick reply, which
     * is the order the two are wanted in: somebody who has just read fifty
     * posts is deciding what they think and whether to keep hearing about it,
     * and then whether to answer. Both used to be above the first post, where
     * they were asking for a verdict on something the reader had not read yet.
     */
    readonly afterContent?: ReactNode
    /**
     * The quick-reply island, or `null` when the viewer may not reply — in which
     * case nothing is rendered and no island bytes are shipped.
     */
    readonly quickReply: ReactNode
  }
}

/**
 * The composer, for both new threads and replies.
 *
 * `action` is a URL string, not a Server Action reference: a slot receiving a
 * function could not cross to a client island, and a URL is what a native form
 * needs anyway. The app's `<form action={serverAction}>` wraps the slot.
 */
/**
 * The composer page.
 *
 * The form *element* is a region rather than a set of value props, and that is
 * a deliberate reversal of this model's first shape. A composer submits to a
 * Server Action, and a Server Action reference is not plain data — which settled
 * that such references never cross the theme contract, which is why logging out
 * is also a form the app renders into a slot. So the theme owns the page around
 * the form (heading, error, preview, where "cancel" goes) and the app owns the
 * controls.
 */
export interface PostFormModel {
  readonly mode: 'thread' | 'reply' | 'edit'
  /** e.g. "Post a new thread in General". */
  readonly heading: string
  /** Where a cancel link returns to — the forum, or the thread being replied to. */
  readonly cancelHref: string
  readonly cancelLabel: string
  readonly errorMessage: string | null
  /*
   * There is no `previewHtml` here yet, and its absence is deliberate. Preview
   * state belongs to the submitted form — it is what the author just typed —
   * so it renders inside the form region, where the action's result actually
   * lands. Once Markdown is turned into HTML on the server, the rendered
   * preview becomes a slot concern and this model gains the field. Carrying it
   * now would be a prop no theme could ever fill.
   */
  readonly regions: {
    /** The app-rendered `<form>` carrying the Server Action and its controls. */
    readonly form: ReactNode
    /**
     * The `EditorToolbar` island, or `null`. A `null` here must leave a working
     * plain-textarea form: the island enhances, it never enables.
     */
    readonly toolbar: ReactNode
  }
}

export interface QuickReplyModel {
  readonly action: string
  readonly threadId: number
  readonly placeholder: string
  readonly submitLabel: string
  /** Where the no-JS reply form lives, for when the island is not rendered. */
  readonly fullReplyHref: string
}

export interface EditorToolbarModel {
  /** The textarea's `id`; the island attaches to it rather than owning it. */
  readonly textareaId: string
  readonly buttons: readonly {
    readonly tag: string
    readonly label: string
    readonly icon: string | null
  }[]
  readonly previewAction: string | null
}

export interface MemberProfileModel {
  readonly user: UserRefModel
  readonly avatarUrl: string | null
  /**
   * The member's group, shown under their name.
   *
   * The same rule the postbit follows: `users.display_group_id` where the
   * member has chosen one, and their primary group otherwise. `null` only
   * where the group behind it has gone.
   */
  readonly title: string | null
  readonly joinedAt: TimeModel
  readonly lastVisitAt: TimeModel | null
  readonly postCount: number
  readonly signatureHtml: string | null
  /** Custom profile fields, already filtered by visibility. */
  readonly fields: readonly { readonly label: string; readonly value: string }[]
  readonly actions: readonly LinkModel[]
  readonly regions?: {
    /** The `profile.panel` region. */
    readonly plugins?: ReactNode
  }
}

/**
 * The search form, reshaped at the slot-contract freeze.
 *
 * It was originally declared as `{ action, query, forums: LinkModel[], errorMessage }`
 * and never rendered — the search page grew its own form instead, so the slot was
 * a contract nothing had ever tested. Wiring it up is what found the shape wrong:
 * a filter is a `<select>`, and an option is a value and a label, not an href.
 * A theme handed `LinkModel[]` would have had to invent the value, most likely by
 * parsing it out of the URL.
 *
 * **`fields` carries the query-parameter names.** Themes never build hrefs (see
 * `LinkModel`), and a `name="q"` typed into a theme is the same rule broken from
 * the other end: it hardcodes the app's URL contract into markup the app does not
 * own, and renaming the parameter silently breaks every installed theme's form
 * while the page keeps rendering.
 */
export interface SearchFormModel {
  /** Where the form submits. A GET form: a search is a URL. */
  readonly action: string
  /** The names to give the controls, owned by the app. */
  readonly fields: {
    readonly query: string
    readonly forum: string
    readonly sort: string
  }
  readonly query: string
  /** The server's limit, so the browser can refuse over-long input first. */
  readonly maxQueryLength: number
  /** Forums this viewer may search. The first option is "everywhere". */
  readonly forums: readonly OptionModel[]
  readonly sorts: readonly OptionModel[]
  /** Guidance for an empty form: quoting, exclusion. `null` once submitted. */
  readonly hint: string | null
  readonly errorMessage: string | null
}

/**
 * One search result: where it goes, and enough of it to decide whether to go.
 *
 * `excerptHtml` is the only HTML in this model, and it is the app's own: the
 * search engine returns the matching fragment with the matched words wrapped in
 * `<b>`, and nothing else survives — the post's own markup is stripped before
 * the excerpt is cut, so a theme is styling emphasis, not rendering a post.
 */
export interface SearchHitModel {
  readonly postId: number
  readonly threadTitle: string
  /** Resolved to the post inside its thread, page and anchor included. */
  readonly href: string
  readonly excerptHtml: string
  readonly authorUsername: string
  readonly postedAt: TimeModel
}

/**
 * The results of one search.
 *
 * ## Why the results are a slot of their own
 *
 * `SearchForm` is a filter panel and this is a listing; they share a page and
 * nothing else. Rendering the results *inside* `SearchForm` would mean a theme
 * that wants a different result row has to reimplement the form to get at it.
 *
 * ## `searchedAt`, and why results are not simply cached
 *
 * A search is stored and its results page is re-checked against the viewer's
 * access every time it is opened, so what a link to a result set shows depends
 * on who opens it. The timestamp is in the model because a theme should be able
 * to say when the search was run — a result page that looks live and is a week
 * old is the failure this field exists to prevent.
 */
export interface SearchResultsModel {
  /** What was searched for, as the reader typed it. */
  readonly terms: string
  readonly searchedAt: TimeModel
  readonly hits: readonly SearchHitModel[]
  /** The next page of this same search, or `null` at the end. */
  readonly nextHref: string | null
  readonly nextLabel: string
  /** Back to an empty form. Always offered: a search that found nothing needs it most. */
  readonly newSearchHref: string
  /**
   * The narrow-this-search form. A GET form, like `SearchForm` and for the same
   * reason — the narrowed search is a URL of its own, not a state this page
   * holds.
   */
  readonly within: {
    readonly action: string
    readonly field: string
    readonly value: string
    readonly label: string
    readonly hint: string
    readonly submitLabel: string
  }
}

/** One row in a discovery listing. */
export interface DiscoveryRowModel {
  readonly threadId: number
  readonly title: string
  readonly href: string
  readonly forum: LinkModel
  readonly authorUsername: string
  readonly replyCount: number
  readonly lastPostAt: TimeModel
  /** `null` when the thread has no reply yet, so the last post is the first. */
  readonly lastPostUsername: string | null
}

/**
 * A discovery listing: "new posts", "today", "unanswered", and the two
 * personal views.
 *
 * One slot rather than five. The views differ in which threads the query
 * returned and in the sentence under the heading; the reader is looking at the
 * same thing in every one of them, and a theme that had to fill five slots to
 * restyle one row would fill four of them by copy and paste.
 *
 * ## `tabs` are given, not built
 *
 * Which views exist depends on whether the viewer is signed in — "my posts" is
 * not offered to a guest — and that is a decision the app has already made.
 * A theme renders the tabs it is handed and marks the current one; it never
 * enumerates the views itself.
 */
export interface DiscoveryViewModel {
  readonly title: string
  /** One line saying what this view selected, e.g. "Threads nobody has replied to yet". */
  readonly blurb: string
  readonly tabsLabel: string
  readonly tabs: readonly TabModel[]
  readonly rows: readonly DiscoveryRowModel[]
  readonly nextHref: string | null
  readonly nextLabel: string
  /**
   * What to say when `rows` is empty — different at the end of a paged list
   * ("you have reached the end") from at the start of one ("nothing here yet").
   */
  readonly emptyMessage: string
  /**
   * Set when the view refused rather than failed: a guest asking for their own
   * threads. The listing is empty and this says why, with `signInHref` to fix
   * it. Not an error — a themed page, not the error page.
   */
  readonly refusal: {
    readonly message: string
    readonly signInHref: string
    readonly signInLabel: string
  } | null
}

/** One tab in a strip of view tabs. */
export interface TabModel {
  readonly href: string
  readonly label: string
  readonly isCurrent: boolean
}

/** Which control panel a shell or a page belongs to. */
export type PanelKind = 'usercp' | 'modcp' | 'admincp'

/**
 * The frame around a control panel.
 *
 * `panel` is in the model because the three panels are the same shape and not
 * the same place: a theme can give the admin panel its own accent without
 * needing three slots, and the default theme uses it to decide how far down the
 * rail starts — the admin panel carries a header of its own above this.
 */
export interface PanelShellModel {
  readonly panel: PanelKind
  /**
   * The other panels this viewer may reach, resolved and already filtered by
   * permission. Never contains the panel being rendered.
   */
  readonly links: readonly LinkModel[]
  readonly linksLabel: string
  readonly regions: {
    /** The `PanelNav` for this panel. */
    readonly nav: ReactNode
  }
  readonly children?: ReactNode
}

/**
 * Where the reader is, relative to one navigation item.
 *
 * `here` is the page being rendered; `under` is an item the reader is inside
 * but not on — a forum's permission screen under "Forums". The distinction is
 * `aria-current="page"` against `aria-current="true"`, and both are the answer
 * to "where am I", which is the only question a rail exists to answer.
 */
export type PanelNavCurrent = 'here' | 'under'

/**
 * One item in a panel's navigation.
 *
 * `current` is resolved by the app from the request path — the theme is told
 * where the reader is, it does not work it out. That is what lets this slot
 * render on the server: the alternative is `usePathname`, which makes the whole
 * rail a client component and ships a router hook to a board that needs none.
 */
export interface PanelNavItemModel {
  readonly href: string
  readonly title: string
  /** A waiting count — the approval queue, unread messages — or `null`. */
  readonly count: number | null
  /** `null` when the reader is somewhere else entirely. */
  readonly current: PanelNavCurrent | null
  /**
   * A page reached from elsewhere rather than from the rail — warning a member,
   * editing one forum. It is shown as where you are and it is not a link,
   * because a link to the page you are on that also needs an argument you no
   * longer have is a dead end. Only ever present while the reader is on it.
   */
  readonly isRecord: boolean
}

export interface PanelNavSectionModel extends PanelNavItemModel {
  /**
   * Already filtered to what belongs on screen: a section's children are
   * listed while it `isOpen`, and a record child only while it is the page.
   */
  readonly children: readonly PanelNavItemModel[]
  /** The reader is on this section or inside it. */
  readonly isOpen: boolean
  /**
   * The panel's front page, which sits above the sections rather than among
   * them. Exactly one section carries this.
   */
  readonly isOverview: boolean
}

export interface PanelNavModel {
  readonly panel: PanelKind
  /** Accessible name for the navigation landmark. */
  readonly label: string
  readonly sections: readonly PanelNavSectionModel[]
  /**
   * The title of the deepest item the reader is under, for a collapsed
   * rail's summary — "Sections · Attachments" says where a tap would leave
   * from. `null` when nothing matched the path.
   */
  readonly currentTitle: string | null
}

/**
 * One control-panel page: heading, the line under it, its controls, its body.
 *
 * ## Why the heading is data and everything around it is a region
 *
 * `title` is a string because a page title is a string — it is also the
 * document title, and a model that allowed markup here would let a theme's
 * `<h1>` and the browser tab disagree. The lede and the controls are regions
 * because the app fills them with forms carrying Server Actions and links it
 * has resolved, neither of which crosses this contract as data.
 */
export interface PanelPageModel {
  readonly panel: PanelKind | null
  readonly title: string
  /** Where this page was reached from, when it is a page under another. */
  readonly back: LinkModel | null
  /**
   * `reading` for prose and forms, `wide` for a table nobody can read at
   * reading width. The theme decides what each measures.
   */
  readonly width: 'reading' | 'wide'
  /**
   * `loose` for a page built of `PanelSection`s, `normal` for a page that is
   * one thing. The theme decides what each measures; the distinction is
   * whether the body has internal headings that need air around them.
   */
  readonly gap: 'normal' | 'loose'
  readonly regions: {
    /** A sentence under the heading saying what this page is for. */
    readonly lede?: ReactNode
    /** Smaller detail under the lede — counts, timestamps, scope. */
    readonly meta?: ReactNode
    /** Controls that act on the whole page, beside the heading. */
    readonly actions?: ReactNode
  }
  readonly children?: ReactNode
}

/**
 * One labelled section within a control-panel page.
 *
 * A separate slot from `PanelPage` because it is rendered *by the page*, in
 * among the page's own content, rather than around it — a page is a heading and
 * a body, and the body may be three of these or none. A theme that restyled the
 * page frame and not the headings inside it would have one visual language
 * outside the content and the default theme's inside.
 */
export interface PanelSectionModel {
  readonly title: string
  /**
   * The id the heading takes, so the section's landmark can point at it. Given
   * by the page because the page is where the section is named twice — once as
   * a heading and once as the region's accessible name.
   */
  readonly headingId: string
  readonly regions: {
    readonly description?: ReactNode
    readonly actions?: ReactNode
  }
  readonly children?: ReactNode
}

/**
 * A link out of an authentication page, with the sentence that introduces it.
 *
 * "New here? **Create an account**" is one thought and two pieces of markup.
 * `lead` carries the first half so the copy stays the app's and the layout
 * stays the theme's — a theme that renders links as a plain list can drop it,
 * and one that renders them as sentences has the sentence.
 */
export interface AuthLinkModel extends LinkModel {
  readonly lead: string | null
}

/**
 * The sign-in, register, reset and confirm pages.
 *
 * ## Why one slot and not five
 *
 * They are the same page: a card, a heading, a form, and the ways out of it.
 * What differs is the form, and a form carrying a Server Action never crosses
 * this contract as data — so it arrives as a region and the four pages become
 * one slot with four things in the hole.
 *
 * ## `alert` is not `Notice`
 *
 * `Notice` is a flash message on a page that has a shell around it; this is the
 * page telling you the link that brought you here is no longer any good, and it
 * has to be readable above the form it concerns. It is a string rather than a
 * model because there is exactly one kind of it.
 */
export interface AuthPageModel {
  readonly title: string
  /** `null` unless something about the way in went wrong. */
  readonly alert: string | null
  readonly links: readonly AuthLinkModel[]
  readonly regions: {
    /** A sentence under the heading. */
    readonly lede?: ReactNode
    /** The form itself, or nothing on a page that only explains something. */
    readonly form?: ReactNode
    /** Standing advice beside the form — where to look before asking again. */
    readonly note?: ReactNode
  }
}

/**
 * The forum jump box — MyBB's `<select>` at the foot of every page.
 *
 * ## Why a form and a button rather than a `<select>` that navigates
 *
 * The obvious implementation is an `onChange` handler that sets
 * `location.href`. It is also inaccessible and does not work without
 * JavaScript, and it fails in the same way for both reasons: **choosing an
 * option is not the same act as committing to it.** A keyboard user moving
 * through a `<select>` with the arrow keys changes the value on every
 * keystroke, so an auto-navigating jump box teleports them to the first forum
 * in the list before they reach the one they wanted.
 *
 * So the model carries an `action` and a submit label, and the theme renders a
 * real `method="get"` form. A theme is free to *also* auto-submit for pointer
 * users; the button is what must always be there.
 *
 * ## `depth` rather than a pre-indented label
 *
 * The app gives the tree's shape and the theme decides how to show it. Baking
 * `— — Subforum` into the label would make the indentation impossible to
 * restyle and would put non-breaking spaces into what a screen reader announces.
 */
export interface ForumJumpModel {
  /** Where the form submits. GET, because a jump is a navigation. */
  readonly action: string
  /** The query-parameter name to give the select. The app owns it. */
  readonly field: string
  /** Visible forums, in tree order. */
  readonly forums: readonly ForumJumpOption[]
  /** The label for the submit control. Always rendered. */
  readonly submitLabel: string
  /** Accessible name for the control, e.g. "Jump to forum". */
  readonly label: string
}

export interface ForumJumpOption {
  readonly value: string
  readonly label: string
  /** 0 for a top-level category. The theme chooses how to show nesting. */
  readonly depth: number
  /** A category is a heading, not a destination — rendered disabled. */
  readonly isCategory: boolean
  readonly isSelected: boolean
}

export interface RedirectNoticeModel {
  readonly message: string
  readonly targetHref: string
  readonly delaySeconds: number
}

export interface ErrorNoticeModel {
  readonly status: number
  readonly title: string
  readonly message: string
  readonly homeHref: string
  /** The request id, so a user can quote it in a report. */
  readonly requestId: string | null
}

/**
 * One inline-moderation checkbox, or `null` when this viewer has no
 * business selecting rows.
 *
 * Plain data, and it has to be: the *form* it belongs to carries a Server
 * Action reference, and such references never cross the theme
 * contract. So the app renders the form — below the listing, where a bar of
 * buttons belongs — and the theme renders a checkbox that says which form it
 * belongs to.
 *
 * `formId` is the whole trick, and it is why this works with scripting off.
 * HTML's `form` attribute associates a control with a form **by id, anywhere
 * in the document**, so the checkboxes can live inside table rows, list items
 * or article elements without the listing having to be wrapped in a `<form>` —
 * which it cannot be, because `ForumDisplay` already renders a mark-read form
 * and nested forms are not a thing browsers will parse.
 */
export interface SelectionModel {
  /** The field name every checkbox shares. */
  readonly name: string
  /** This row's value, opaque to the theme. */
  readonly value: string
  /** The `id` of the app-rendered form these checkboxes submit with. */
  readonly formId: string
  /** For a visually-hidden label: "Select 'How do I …' for moderation". */
  readonly label: string
}

export interface PostBitSlotModel {
  readonly post: PostBitModel
  /** The inline-moderation checkbox, or `null`. A theme that ignores it loses only bulk actions. */
  readonly select: SelectionModel | null
  readonly regions: {
    /** The `PostActions` slot, rendered by the page. */
    readonly actions: ReactNode
    /** The `postbit.badges` region, beside the author's name. */
    readonly pluginBadges?: ReactNode
    /** The `postbit.footer` region, below the body. */
    readonly pluginFooter?: ReactNode
  }
}

export interface ForumRowSlotModel {
  readonly forum: ForumRowModel
}

export interface ThreadRowSlotModel {
  readonly thread: ThreadRowModel
  /** The inline-moderation checkbox, or `null`. */
  readonly select: SelectionModel | null
}

export interface PostActionsSlotModel {
  readonly actions: PostActionsModel
  readonly postId: number
  /**
   * App-rendered controls that belong beside the post's own actions — today,
   * the multi-quote island.
   *
   * It is `children` for the reason logging out is: the button is a client
   * island holding browser state, and neither a component nor a handler can
   * cross this contract as data. Before this field the page had nowhere to put
   * it but `PostBitModel.regions.pluginFooter`, so every post on the board
   * carried a second bordered row containing one control — the plugin region
   * used as a parking space, and a visible band of furniture per post as the
   * price.
   *
   * Additive under the versioning policy, and `children` is already exempt from the
   * plain-data rule.
   */
  readonly children?: ReactNode
}

/* ------------------------------------------------------------------ *
 * The slot → model map
 * ------------------------------------------------------------------ */

/**
 * What each slot is handed. Every key here must be a slot in `SLOTS`, and every
 * slot in `SLOTS` must have a key here — both directions are asserted below, so
 * adding a slot without a model (or the reverse) fails `pnpm typecheck` rather
 * than surfacing as an `any` in a theme.
 */
export interface SlotModels {
  Shell: ShellModel
  Header: HeaderModel
  UserPanel: UserPanelModel
  Navigation: NavigationModel
  Footer: FooterModel
  Notice: NoticeModel

  Announcement: AnnouncementModel

  BoardIndex: BoardIndexModel
  CategoryBlock: CategoryBlockModel
  ForumRow: ForumRowSlotModel
  BoardStats: BoardStatsModel
  WhoIsOnline: WhoIsOnlineModel
  LatestThreads: LatestThreadsModel
  LatestPosts: LatestPostsModel

  ForumDisplay: ForumDisplayModel
  ThreadRow: ThreadRowSlotModel
  SubforumList: SubforumListModel
  Pagination: PaginationModel

  ThreadView: ThreadViewModel
  PostBit: PostBitSlotModel
  PostActions: PostActionsSlotModel
  QuickReply: QuickReplyModel

  PostForm: PostFormModel
  EditorToolbar: EditorToolbarModel

  MemberProfile: MemberProfileModel

  AuthPage: AuthPageModel

  SearchForm: SearchFormModel
  SearchResults: SearchResultsModel

  DiscoveryView: DiscoveryViewModel

  PanelShell: PanelShellModel
  PanelNav: PanelNavModel
  PanelPage: PanelPageModel
  PanelSection: PanelSectionModel

  ForumJump: ForumJumpModel

  RedirectNotice: RedirectNoticeModel
  ErrorNotice: ErrorNoticeModel
}

/* ------------------------------------------------------------------ *
 * Compile-time proofs
 * ------------------------------------------------------------------ */

/**
 * Fails with the offending name in the message, which is the point — a bare
 * `never` mismatch sends people hunting.
 */
type AssertNever<T extends never> = T

type _NoSlotWithoutModel = AssertNever<Exclude<SlotName, keyof SlotModels>>
type _NoModelWithoutSlot = AssertNever<Exclude<keyof SlotModels, SlotName>>

/** Every model is plain data. Adding a `Date` to one names it here. */
type _PlainDataCheck = AssertNever<
  {
    [K in keyof SlotModels]: IsPlainData<SlotModels[K]> extends true ? never : K
  }[keyof SlotModels]
>
