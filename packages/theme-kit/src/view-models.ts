/** Public theme models contain JSON-shaped data. Use TimeModel for timestamps and prepared labels for locale-dependent values. `_PlainDataCheck` and the type tests enforce this contract. Additive fields follow the API version policy; removals and renames require deprecation. */

import type { ReactNode } from 'react'

import type { EditorInsertion, EditorTag } from './editor'
import type { SlotName } from './slots'

/* ------------------------------------------------------------------ *
 * The plain-data constraint
 * ------------------------------------------------------------------ */

/** Maps non-JSON-shaped fields to `never` for compile-time validation. Methods reject Date, Map, Set, RegExp and Promise values. Data-only class instances are structurally indistinguishable from plain objects and cannot be detected. */
export type Serialisable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer E)[]
    ? readonly Serialisable<E>[]
    : T extends (...args: never[]) => unknown
      ? never
      : T extends object
        ? { readonly [K in keyof T]: Serialisable<T[K]> }
        : never

/** `children` and `regions` may carry rendered React nodes. The app resolves and renders nested slots; a slot must not resolve another slot. This preserves child-theme overrides without passing theme functions through models. */
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

/** A counter, in both forms a template needs. See this file's header. */
export interface CountModel {
  /** The number itself: compare, pluralise and branch on it. Never rendered raw. */
  readonly value: number
  /** Preformatted in the viewer's language, e.g. "1,204" or "1.204". */
  readonly label: string
}

/** A resolved link. Themes never build hrefs; the app owns URL shape. */
export interface LinkModel {
  readonly label: string
  readonly href: string
  /** Link group. Insert a separator when consecutive values differ; do not depend on specific values. Absent values form one group. */
  readonly group?: string
  /** Open in a new tab when true. Pair `target="_blank"` with `rel="noopener noreferrer"`. Optional since 0.16. */
  readonly newTab?: boolean
  /** One level of child links. Render them with keyboard and pointer access. The app does not nest submenus. Optional since 0.16. */
  readonly submenu?: readonly LinkModel[]
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
  /** Rendering hint for moderator-panel access, already resolved by the Authorizer. The destination still checks access; this field does not grant it. */
  readonly canAccessModCp: boolean
}

/** A user as they appear attached to content. */
export interface UserRefModel {
  /** `null` when the account was deleted; `username` is still shown. */
  readonly userId: number | null
  readonly username: string
  readonly profileHref: string | null
  /** CSS class for the member’s group colour in both schemes, or null. Apply it to the member name. */
  readonly nameClass?: string | null | undefined
}

/** A displayed membership group. Apply `nameClass` to its name and use the supplied title and badge. */
export interface GroupTagModel {
  readonly title: string
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

/** Select or radio option with its current state in `isSelected`. Render the provided value and label. */
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
  readonly threadCount: CountModel
  readonly postCount: CountModel
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
  readonly replyCount: CountModel
  readonly viewCount: CountModel
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly isUnread: boolean
  /** Set when the thread is a move stub; the row renders as a redirect. */
  readonly isMoved: boolean
  /** Thread visibility. Unapproved/deleted rows are supplied only when the viewer is permitted to see them. Render the corresponding state. */
  readonly visibility?: 'visible' | 'unapproved' | 'deleted'
  readonly lastPost: LastPostModel | null
}

/** Resolved pagination labels and hrefs. Render links as provided; do not construct URLs in the theme. */
export interface PaginationModel {
  readonly page: number
  readonly pageCount: number
  /** True when `pageCount` is an exact total. Otherwise it is a lower bound: display the current page without “of N”. */
  readonly pageCountIsExact: boolean
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
  /** Display-group title or custom member title; null when absent. */
  readonly title: string | null
  /** Displayed groups, starting with the display group and limited by the board setting. Render this list instead of `title` when nonempty; otherwise use `title`, including custom titles. */
  readonly groups?: readonly GroupTagModel[] | undefined
  /** Group badge, or null. Uses LogoModel; darkSrc is provided only for the system colour scheme. */
  readonly badge?: LogoModel | null | undefined
  /**
   * This member's reputation, or `null` when the board has it switched off.
   *
   * A denormalised counter on `users`, so it costs the postbit nothing.
   */
  readonly reputation?: CountModel | null | undefined
  readonly postCount: CountModel
  readonly joinedAt: TimeModel | null
  /** Pre-rendered Markdown. Trusted output of the board's own renderer. */
  readonly signatureHtml: string | null
  /** Online status visible to this reader. Invisible authors appear offline without modcp.access. Render as supplied. */
  readonly isOnline: boolean
  /** Profile fields configured for post display and permitted for this viewer. Render labels and values as text. */
  readonly fields: readonly { readonly label: string; readonly value: string }[]
}

export interface PostActionsModel {
  readonly quoteHref: string | null
  readonly editHref: string | null
  /** Restore action for a soft-deleted post. Mutually exclusive with editHref. */
  readonly restoreHref: string | null
  readonly historyHref?: string | null
  readonly reportHref: string | null
  /** Link to warn the author about this post. Null for self, guests or insufficient permissions. */
  readonly warnHref: string | null
  /** Reserved for non-inline moderation controls; currently null. Inline selection uses its separate model. */
  readonly moderateHref: string | null
  /** Post-specific reputation action. Null for the current author, disabled reputation or insufficient permission. */
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
  /** @deprecated Since theme API 0.5; removal scheduled for 1.0. Use `post.id` to request a server-authorized quote. */
  readonly quoteSource: string
  readonly postedAt: TimeModel
  /** "Last edited by X on Y", already assembled, or `null`. */
  readonly editedNote: string | null
  readonly isFirstPost: boolean
  /** A moderator sees deleted and unapproved posts, marked as such. */
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  /** Ignored-author placeholder, or null. When set, the app withholds body, signature and custom fields while preserving post position and numbering. Render the placeholder and reveal link. */
  readonly ignored: {
    readonly authorUsername: string
    /** Same page, this post revealed. A GET: revealing changes nothing. */
    readonly revealHref: string
  } | null
  /** Downloadable attachments only; pending and failed uploads are excluded. Use `thumbnailHref ?? href` for an inline image. Non-images and images without a smaller preview have a null thumbnail. */
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
/** Board logo sources prepared for the reader’s colour preference. If no logo is supplied, render the board name. Honour the optional dark source for system colour mode. */
export interface LogoModel {
  /** The image to render. Already the right one for a forced colour scheme. */
  readonly src: string
  /** Optional dark source for a `<picture>` with `(prefers-color-scheme: dark)`. Use the primary source as its fallback. */
  readonly darkSrc: string | null
  /** Never empty — the board's name when the operator has set nothing. */
  readonly alt: string
}

export interface HeaderModel {
  readonly boardTitle: string
  readonly homeHref: string
  readonly viewer: ViewerModel
  readonly navigation: readonly LinkModel[]
  /** Optional board logo. Use the supplied alternative text and dimensions; fall back to the board name when absent. */
  readonly logo?: LogoModel | undefined
  readonly children?: ReactNode
}

export interface UserPanelModel {
  readonly viewer: ViewerModel
  /** Sign-in / register, or account links. Resolved by the app. */
  readonly links: readonly LinkModel[]
  /** `value` is `0` when there is nothing to show. */
  readonly unreadNotifications: CountModel
  readonly unreadMessages: CountModel
  /** Destinations for the unread notification and message counts. Use the resolved hrefs. */
  readonly notificationsHref?: string
  readonly messagesHref?: string
  readonly regions?: {
    /** App-rendered notification menu with messages and permitted moderation content, including a no-JavaScript fallback. Render instead of separate unread-count controls when present. Optional since 0.16. */
    readonly notifications?: ReactNode
  }
  /** App-rendered account controls, including the POST logout form. Place the supplied form; do not replace logout with a GET link. */
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
  /** Optional software attribution link supplied by the app. Added in 0.8. */
  readonly poweredBy?: LinkModel
  /** Optional app-rendered forum-jump and appearance controls. Place both in the footer. Added in 0.20. */
  readonly regions?: {
    readonly controls?: ReactNode
  }
}

export interface NoticeModel {
  readonly kind: 'info' | 'success' | 'warning' | 'error'
  readonly message: string
  readonly dismissHref: string | null
}

/** Dated, authored announcement, visible until expiry. Flash feedback uses NoticeModel. */
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
    /** App-rendered newest-thread/post region, refreshed together in one request. Place it as a unit. Absent when unavailable. */
    readonly latest?: ReactNode
    /** Optional, pre-rendered index.footer plugin contributions in host order. */
    readonly plugins?: ReactNode
    /** Optional, pre-rendered live announcements. Absent when there are none. */
    readonly announcements?: ReactNode
  }
}

/** A category and the forum rows under it; the rows arrive as `children`. */
export interface CategoryBlockModel {
  readonly category: ForumRowModel
  readonly children?: ReactNode
}

export interface BoardStatsModel {
  readonly threadCount: CountModel
  readonly postCount: CountModel
  readonly memberCount: CountModel
  readonly newestMember: UserRefModel | null
  /** Last counter-rollup time, or null before the first run. Display it to identify the age of the totals. */
  readonly computedAt: TimeModel | null
}

/** Online visitor. Location titles and links are filtered by reader permissions. */
export interface OnlineMemberModel extends UserRefModel {
  /** Where they are, as this reader may be told. Never null — see `label`. */
  readonly location: { readonly label: string; readonly href: string | null }
  /** True only for staff, who see hidden members marked rather than absent. */
  readonly isInvisible: boolean
  readonly lastSeen: TimeModel
}

export interface WhoIsOnlineModel {
  readonly guestCount: CountModel
  readonly members: readonly OnlineMemberModel[]
  /** How many members are listed. Render this rather than `members.length`. */
  readonly memberCount: CountModel
  /** Members plus guests, as this reader is permitted to count them. */
  readonly total: CountModel
  readonly recordCount: CountModel
  readonly recordAt: TimeModel | null
  /** The full list, for a theme that shows only a summary here. */
  readonly fullListHref: string
}

/** Latest thread with its forum identity. */
export interface LatestThreadModel {
  readonly title: string
  readonly href: string
  /** The forum it was started in, resolved — a theme never builds an href. */
  readonly forum: LinkModel
  readonly author: UserRefModel
  readonly replyCount: CountModel
  readonly startedAt: TimeModel
}

/** Newest threads with `capturedAt` indicating the read time. The app refreshes this server-rendered model. */
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
  /** Plain-text post excerpt, flattened from Markdown and cut at a word boundary. Render as text. */
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
    /** App-rendered forum ordering controls. Place below the heading and above the listing. Subscription controls are in `afterContent`. */
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
    /** App-rendered forum subscription controls. Place after the listing. */
    readonly afterContent?: ReactNode
  }
}

export interface SubforumListModel {
  readonly forums: readonly ForumRowModel[]
}

/** Thread watch toggle. Submit the supplied `action`; use `subscribed` for the label/state. It uses the board’s default cadence. The full cadence selector remains in `afterContent`. */
export interface ThreadWatchModel {
  readonly subscribed: boolean
  /** A native POST target that flips `subscribed`. */
  readonly action: string
}

export interface ThreadViewModel {
  readonly thread: ThreadRowModel
  readonly forum: LinkModel
  readonly replyHref: string | null
  /** A native POST target for the last visible post on this page. */
  readonly markReadAction: string | null
  /** Optional watch toggle. Null for guests or without the subscription service. */
  readonly watch?: ThreadWatchModel | null
  readonly regions: {
    /** App-rendered moderator tools and poll. Place below the title and above posts. Rating and subscription controls are in `afterContent`. */
    readonly tools?: ReactNode
    /** One `PostBit` per post on this page. */
    readonly posts: ReactNode
    readonly pagination: ReactNode
    /** App-rendered rating and subscription controls. Place after posts and before quick reply. */
    readonly afterContent?: ReactNode
    /**
     * The quick-reply island, or `null` when the viewer may not reply — in which
     * case nothing is rendered and no island bytes are shipped.
     */
    readonly quickReply: ReactNode
  }
}

/** Composer for new threads and replies. action is a URL; the app supplies the enclosing form. */
/** Composer page model. The app owns the submitted form; the theme places its heading, errors, preview, form and cancel link. */
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
    /** Optional toolbar region. The built-in composer supplies null because its toolbar is inside `form`, beside the textarea. A null toolbar must leave the form usable. */
    readonly toolbar: ReactNode
  }
}

/** Quick-reply island. `children` carries the app’s form, including validation, quoting, drafts and attachments. Labels and `fullReplyHref` support alternate presentations without inspecting the form. */
export interface QuickReplyModel {
  readonly threadId: number
  readonly placeholder: string
  readonly submitLabel: string
  /** Where the no-JS reply form lives, for when the island is not rendered. */
  readonly fullReplyHref: string
  readonly children?: ReactNode
}

/** Editor control. Exactly one of `tag` and `insertion` is set. Use `applyEditorTag` for a built-in tag or `applyInsertion` for a plugin insertion; both operate on serializable edit data. */
export interface EditorToolbarButtonModel {
  /** One of the board's own commands, or `null` for a plugin's `insertion`. */
  readonly tag: EditorTag | null
  /** A plugin's own edit, or `null` for a built-in `tag`. */
  readonly insertion: EditorInsertion | null
  readonly label: string
  /** `label`, plus the keyboard shortcut when this tag has one, already formatted. */
  readonly title: string
  /** `aria-keyshortcuts`, e.g. `"Control+b"`, or `null` for a tag with no shortcut. */
  readonly keyShortcut: string | null
  /** Optional theme icon name. Unknown or null names render no icon; the text label remains accessible. */
  readonly icon: string | null
  /** Placeholder for an empty wrap/spoiler selection. Null when unnecessary and for insertion buttons. */
  readonly placeholder: string | null
}

export interface EditorToolbarModel {
  /** The textarea's `id`; the island attaches to it rather than owning it. */
  readonly textareaId: string
  /** Accessible name for the toolbar's `role="group"`. */
  readonly groupLabel: string
  readonly buttons: readonly EditorToolbarButtonModel[]
  /** Attachment picker or null. `inputId` targets the app-owned hidden file input. An enhanced button may activate it; the app owns upload handling. */
  readonly attachment: { readonly inputId: string; readonly label: string } | null
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
  /** Displayed groups, with display group first, then display order, capped by Maximum displayed groups. Use title only when groups is empty. */
  readonly groups?: readonly GroupTagModel[] | undefined
  readonly joinedAt: TimeModel
  readonly lastVisitAt: TimeModel | null
  readonly postCount: CountModel
  readonly signatureHtml: string | null
  /** Custom profile fields, already filtered by visibility. */
  readonly fields: readonly { readonly label: string; readonly value: string }[]
  readonly actions: readonly LinkModel[]
  readonly regions?: {
    /** The `profile.panel` region. */
    readonly plugins?: ReactNode
  }
}

/** Search form. Use the supplied `fields` for input names and supplied option values. Do not hardcode query-parameter names or derive them from URLs. */
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
  /** Optional author, date, forum and result-type controls. Omitted controls use the default search scope. */
  readonly advanced?: SearchAdvancedModel
}

/** Select control with its submitted name, label and options. Render controls in the supplied order. */
export interface SearchChoiceModel {
  readonly field: string
  readonly label: string
  readonly options: readonly OptionModel[]
}

/** A checkbox: on when `isOn`, submitted as `value` under `field`. */
export interface SearchToggleModel {
  readonly field: string
  readonly value: string
  readonly label: string
  readonly isOn: boolean
}

/** A free-text control: a name to submit under, and what is in it now. */
export interface SearchTextFieldModel {
  readonly field: string
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly hint: string
}

/** Advanced search controls. Keep open when `isOpen` is true so applied filters are visible. Always-open rendering is also supported. */
export interface SearchAdvancedModel {
  readonly label: string
  readonly isOpen: boolean
  readonly author: SearchTextFieldModel
  readonly toggles: readonly SearchToggleModel[]
  readonly choices: readonly SearchChoiceModel[]
}

/** A filter that is on, and the href that turns it off. */
export interface SearchChipModel {
  readonly label: string
  readonly removeHref: string
}

/** Results filters: count, sort links, applied-filter removal links and a GET form. Preserve existing filters in supplied hrefs and hidden inputs. Option counts exclude forum/author narrowing; `note` identifies lower-bound counts. Keep labels, touch targets and long values readable without horizontal page scrolling. */
export interface SearchRefineModel {
  /** Where the filters submit: this same results page. */
  readonly action: string
  readonly label: string
  /** One line: how many matched, and what is being shown. */
  readonly summary: string
  /** The bound on the count, when there is one. `null` when the count is exact. */
  readonly note: string | null
  /** The order, as links. One is always current. */
  readonly sorts: readonly TabModel[]
  /** Names the run of order links, for a theme that labels it. */
  readonly sortsLabel: string
  readonly choices: readonly SearchChoiceModel[]
  readonly submitLabel: string
  readonly applied: readonly SearchChipModel[]
  /** Drops every filter and keeps the order, or `null` when none is on. */
  readonly clearHref: string | null
}

/** A form value carried across a submit without being shown. */
export interface HiddenFieldModel {
  readonly name: string
  readonly value: string
}

/** Search result with destination and excerpt. `excerptHtml` contains app-generated match emphasis; source markup is stripped. Render other fields as text. */
export interface SearchHitModel {
  readonly postId: number
  readonly threadTitle: string
  /** Resolved to the post inside its thread, page and anchor included. */
  readonly href: string
  readonly excerptHtml: string
  readonly authorUsername: string
  readonly postedAt: TimeModel
}

/** Search results with their original `searchedAt` timestamp. Visibility is checked again for the current viewer when opening a stored result set. */
export interface SearchResultsModel {
  /** What was searched for, as the reader typed it. */
  readonly terms: string
  readonly searchedAt: TimeModel
  readonly hits: readonly SearchHitModel[]
  /** Legacy next-page link, or null at the end. Prefer `regions.pagination`; render only one pager. */
  readonly nextHref: string | null
  readonly nextLabel: string
  /** Back to an empty form. Always offered: a search that found nothing needs it most. */
  readonly newSearchHref: string
  /** GET filter form. Preserve each `hidden` input so narrowing retains the original advanced options. */
  readonly within: {
    readonly action: string
    readonly field: string
    readonly value: string
    readonly label: string
    readonly hint: string
    readonly submitLabel: string
    readonly hidden?: readonly HiddenFieldModel[]
  }
  /**
   * Filtering and sorting for the set on screen. Optional: a theme that
   * ignores it shows the results as the search asked for them.
   */
  readonly refine?: SearchRefineModel
  readonly regions?: {
    /** The `Pagination` for this result set, rendered by the page. */
    readonly pagination?: ReactNode
  }
}

/** One row in a discovery listing. */
export interface DiscoveryRowModel {
  readonly threadId: number
  readonly title: string
  readonly href: string
  readonly forum: LinkModel
  readonly authorUsername: string
  readonly replyCount: CountModel
  readonly lastPostAt: TimeModel
  /** `null` when the thread has no reply yet, so the last post is the first. */
  readonly lastPostUsername: string | null
}

/** Discovery listing for new, today, unread, unanswered or personal content. Render the supplied tabs and current state; available tabs depend on the viewer. */
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
  /** Access notice for a refused discovery view. Results are empty; signInHref provides the sign-in action. */
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

/** Control-panel frame. Use `panel` to distinguish member, moderator and administrator layouts. */
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

/** Navigation position: `here` uses `aria-current="page"`; `under` uses `aria-current="true"` for an ancestor section. */
export type PanelNavCurrent = 'here' | 'under'

/** Panel navigation item. The app resolves `current` from the request path; no client router lookup is needed. */
/** Semantic icon name. The theme chooses its graphic or omits it. Unknown names render nothing. */
export type PanelNavIcon =
  | 'antispam'
  | 'avatar'
  | 'buddies'
  | 'content'
  | 'forums'
  | 'groups'
  | 'ip'
  | 'log'
  | 'messages'
  | 'notifications'
  | 'overview'
  | 'plugins'
  | 'profile'
  | 'queue'
  | 'reports'
  | 'security'
  | 'settings'
  | 'signature'
  | 'subscriptions'
  | 'system'
  | 'themes'
  | 'tokens'
  | 'users'

export interface PanelNavItemModel {
  readonly href: string
  readonly title: string
  /** What this item is about, for a themed icon. `null` on a child item. */
  readonly icon: PanelNavIcon | null
  /** A waiting count — the approval queue, unread messages — or `null`. */
  readonly count: number | null
  /** `null` when the reader is somewhere else entirely. */
  readonly current: PanelNavCurrent | null
  /** Current contextual page reached outside the rail, such as a forum editor. Render as a label rather than a link. */
  readonly isRecord: boolean
}

export interface PanelNavSectionModel extends PanelNavItemModel {
  /**
   * Available destinations, including those in closed sections so a menu can
   * expand them without navigation. A record child appears only on its page.
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
   * The title of the deepest item the reader is under, for the current
   * location beside a mobile navigation trigger. `null` when no path matched.
   */
  readonly currentTitle: string | null
}

/** Panel page title and app-rendered supporting text, actions and body. The title remains plain text for the page heading and browser title. */
export interface PanelPageModel {
  readonly panel: PanelKind | null
  readonly title: string
  /** Where this page was reached from, when it is a page under another. */
  readonly back: LinkModel | null
  /** `panel` fills an existing PanelShell; `standalone` supplies its own centred frame for pages such as online, statistics and reports. Defaults to panel. */
  readonly frame?: 'panel' | 'standalone'
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

/** Labelled section within a panel page, rendered among the page’s content. */
export interface PanelSectionModel {
  readonly title: string
  /** Heading ID used by the section landmark. */
  readonly headingId: string
  readonly regions: {
    readonly description?: ReactNode
    readonly actions?: ReactNode
  }
  readonly children?: ReactNode
}

/** Authentication-page link and its optional introductory copy. The theme may present the link alone or with its `lead`. */
export interface AuthLinkModel extends LinkModel {
  readonly lead: string | null
}

/** Sign-in, registration, reset and confirmation frame. Place the app-rendered form and links. Show `alert` above the form when supplied. */
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

/** Forum selector in a real GET form with a submit button. Do not navigate on keyboard selection changes. Use `depth` to indent options without modifying their labels. */
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

/** Inline-moderation checkbox or null when unavailable. Associate it with the app-owned form using `formId` and HTML’s `form` attribute. Do not nest forms around listings. */
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
  readonly regions?: {
    /** Optional thread-row plugin badges, supplied by one batched call per page. Place beside the thread flags. Added in 0.22. */
    readonly pluginBadges?: ReactNode
  }
}

export interface PostActionsSlotModel {
  readonly actions: PostActionsModel
  readonly postId: number
  /** App-rendered post controls, including the multi-quote island. Place beside the post’s action links. */
  readonly children?: ReactNode
}

/* ------------------------------------------------------------------ *
 * The slot → model map
 * ------------------------------------------------------------------ */

/** Slot-to-model map. Type checks require one entry per registered slot and reject unregistered entries. */
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
