/**
 * F25 — the view models slots are handed, and the rule they all obey.
 *
 * These types are the **public API for themes**. Per docs/nextjs-conventions.md
 * adding a field is a minor change; renaming or removing one needs a deprecation
 * cycle. F77 freezes them as theme-kit v1.
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
 *  3. the **public REST API** (F81), which returns view models as JSON.
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
 * no test can kill is a clause that will quietly stop being true (D10).
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
 * page composition stays as it is. F77 revisits this if a real theme needs more.
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
   * on its own, and R6 keeps themes out of authorization entirely.
   */
  readonly canAccessAdminCp: boolean
  /**
   * Whether to render the moderation link (F48). Same shape and same rule as
   * `canAccessAdminCp`: a rendering hint the Authorizer has already decided.
   *
   * Group-level only, which is a real limitation rather than an oversight: a
   * per-forum appointee's queue exists and is reachable, but answering "does
   * this person moderate anything" for them costs the tree, and the shell
   * renders on every page. F54's ModCP is where that link earns its query.
   */
  readonly canAccessModCp: boolean
}

/** A user as they appear attached to content. */
export interface UserRefModel {
  /** `null` when the account was deleted; `username` is still shown. */
  readonly userId: number | null
  readonly username: string
  readonly profileHref: string | null
}

/** The last post in a forum or thread, as a listing shows it. */
export interface LastPostModel {
  readonly threadTitle: string
  /** Deep link to the post itself, not the thread's first page. */
  readonly href: string
  readonly author: UserRefModel
  readonly at: TimeModel
}

/** A thread prefix (F37 supplies styling from `token`). */
export interface PrefixModel {
  readonly label: string
  readonly token: string | null
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
  /** F32. `false` for a guest, who has no read state. */
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
 * works with JavaScript disabled (R5).
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
  /** Usergroup title or custom user title. */
  readonly title: string | null
  readonly postCount: number
  readonly joinedAt: TimeModel | null
  /** Pre-rendered BBCode (F36). Trusted output of the sanitising renderer. */
  readonly signatureHtml: string | null
  readonly isOnline: boolean
  /**
   * F59's custom fields, for the ones an operator marked for the postbit and
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
   * Where a soft-deleted post is put back (F41).
   *
   * A separate field rather than a second meaning for `editHref`, because the
   * two are never both offered: a deleted post cannot be edited, and a visible
   * one has nothing to restore. A theme that renders both gets exactly one.
   */
  readonly restoreHref: string | null
  readonly reportHref: string | null
  /**
   * Warn this post's author, citing this post (F53).
   *
   * Present for moderators only, and `null` for a post whose author is the
   * viewer or a deleted account. Separate from `moderateHref` because a warning
   * is aimed at the *person* and the post is only the evidence — which is also
   * why the link carries the post id rather than living on the post's own
   * moderation controls.
   */
  readonly warnHref: string | null
  /**
   * Reserved for per-post moderation controls that are not inline (F54).
   *
   * Still `null` everywhere: F52 put per-post moderation on checkboxes and a
   * bar rather than a per-post link, so nothing fills this yet. It stays in the
   * contract because F54's ModCP is where a per-post moderation *page* would
   * live, and removing a public field to add it back next feature is worse
   * than a documented `null`.
   */
  readonly moderateHref: string | null
}

export interface PostBitModel {
  readonly id: number
  /** Position within the thread, 1-based. What "#12" in the corner means. */
  readonly number: number
  readonly permalink: string
  readonly author: PostAuthorModel
  /** Pre-rendered BBCode (F36). */
  readonly bodyHtml: string
  readonly postedAt: TimeModel
  /** "Last edited by X on Y", already assembled, or `null`. */
  readonly editedNote: string | null
  readonly isFirstPost: boolean
  /** F47: a moderator sees deleted and unapproved posts, marked as such. */
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly actions: PostActionsModel
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
export interface HeaderModel {
  readonly boardTitle: string
  readonly homeHref: string
  readonly viewer: ViewerModel
  readonly navigation: readonly LinkModel[]
  readonly children?: ReactNode
}

export interface UserPanelModel {
  readonly viewer: ViewerModel
  /** Sign-in / register, or account links. Resolved by the app. */
  readonly links: readonly LinkModel[]
  /** F55. `0` when there is nothing to show. */
  readonly unreadNotifications: number
  readonly unreadMessages: number
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
}

export interface NoticeModel {
  readonly kind: 'info' | 'success' | 'warning' | 'error'
  readonly message: string
  readonly dismissHref: string | null
}

export interface BoardIndexModel {
  /** F32's "mark all read" — a form target, not a client handler. */
  readonly markAllReadAction: string | null
  readonly regions: {
    /** One `CategoryBlock` per top-level category, already rendered. */
    readonly categories: ReactNode
    readonly stats: ReactNode
    readonly online: ReactNode
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
}

export interface WhoIsOnlineModel {
  readonly guestCount: number
  readonly members: readonly UserRefModel[]
  readonly recordCount: number
  readonly recordAt: TimeModel | null
}

export interface ForumDisplayModel {
  readonly forum: ForumRowModel
  readonly newThreadHref: string | null
  readonly markReadAction: string | null
  readonly regions: {
    readonly subforums: ReactNode
    /** One `ThreadRow` per thread. Empty-state markup is the theme's. */
    readonly threads: ReactNode
    readonly pagination: ReactNode
  }
}

export interface SubforumListModel {
  readonly forums: readonly ForumRowModel[]
}

export interface ThreadViewModel {
  readonly thread: ThreadRowModel
  readonly forum: LinkModel
  readonly replyHref: string | null
  /** F32: a native POST target for the last visible post on this page. */
  readonly markReadAction: string | null
  readonly regions: {
    /** One `PostBit` per post on this page. */
    readonly posts: ReactNode
    readonly pagination: ReactNode
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
 * The composer page (F39).
 *
 * The form *element* is a region rather than a set of value props, and that is
 * a deliberate reversal of this model's first shape. A composer submits to a
 * Server Action, and a Server Action reference is not plain data — D38 settled
 * that such references never cross the theme contract, which is why logging out
 * is also a form the app renders into a slot. So the theme owns the page around
 * the form (heading, error, preview, where "cancel" goes) and the app owns the
 * controls. See D42.
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
   * lands. When F36 can turn BBCode into HTML on the server, the rendered
   * preview becomes a slot concern and this model gains the field. Carrying it
   * now would be a prop no theme could ever fill.
   */
  readonly regions: {
    /** The app-rendered `<form>` carrying the Server Action and its controls. */
    readonly form: ReactNode
    /**
     * The `EditorToolbar` island, or `null`. A `null` here must leave a working
     * plain-textarea form: the island enhances, it never enables (R5).
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
  readonly title: string | null
  readonly joinedAt: TimeModel
  readonly lastVisitAt: TimeModel | null
  readonly postCount: number
  readonly signatureHtml: string | null
  /** F59's custom fields, already filtered by visibility. */
  readonly fields: readonly { readonly label: string; readonly value: string }[]
  readonly actions: readonly LinkModel[]
}

export interface SearchFormModel {
  readonly action: string
  readonly query: string
  readonly forums: readonly LinkModel[]
  readonly errorMessage: string | null
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
  /** F09's request id, so a user can quote it in a report. */
  readonly requestId: string | null
}

/**
 * One inline-moderation checkbox (F52), or `null` when this viewer has no
 * business selecting rows.
 *
 * Plain data, and it has to be: the *form* it belongs to carries a Server
 * Action reference, and D38 settled that such references never cross the theme
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
  /** F52's checkbox, or `null`. A theme that ignores it loses only bulk actions. */
  readonly select: SelectionModel | null
  readonly regions: {
    /** The `PostActions` slot, rendered by the page. */
    readonly actions: ReactNode
  }
}

export interface ForumRowSlotModel {
  readonly forum: ForumRowModel
}

export interface ThreadRowSlotModel {
  readonly thread: ThreadRowModel
  /** F52's checkbox, or `null`. */
  readonly select: SelectionModel | null
}

export interface PostActionsSlotModel {
  readonly actions: PostActionsModel
  readonly postId: number
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

  BoardIndex: BoardIndexModel
  CategoryBlock: CategoryBlockModel
  ForumRow: ForumRowSlotModel
  BoardStats: BoardStatsModel
  WhoIsOnline: WhoIsOnlineModel

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

  SearchForm: SearchFormModel

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
