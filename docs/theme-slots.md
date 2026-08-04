# Theme slots and view models

<!--
  GENERATED FILE — do not edit.

  Written by scripts/theme-api-docs.mjs from packages/theme-kit/src/{slots,api,
  view-models}.ts. Run `pnpm theme:docs` after changing any of them; `pnpm verify`
  and CI run `pnpm theme:docs:check` and fail when this file and the code disagree.
-->

**theme-kit v1.1.** 26 slots: 24 stable, 2 provisional, 0 deprecated.

What the marks mean, and how something is removed, is in
[`theme-api.md`](./theme-api.md). In short: a **stable** slot and the fields of its
model do not change before v2; a **provisional** slot is named but not yet rendered
by any page, so its model may change in a minor release; a **deprecated** slot still
works and has a removal scheduled below.

## Every slot

| Slot | Kind | Stability | Feature | Props |
|---|---|---|---|---|
| [`Shell`](#shell) | `server` | stable | F27 | `ShellModel` |
| [`Header`](#header) | `server` | stable | F27 | `HeaderModel` |
| [`UserPanel`](#userpanel) | `server` | stable | F27 | `UserPanelModel` |
| [`Navigation`](#navigation) | `server` | stable | F27 | `NavigationModel` |
| [`Footer`](#footer) | `server` | stable | F27 | `FooterModel` |
| [`Notice`](#notice) | `server` | stable | F27 | `NoticeModel` |
| [`BoardIndex`](#boardindex) | `server` | stable | F29 | `BoardIndexModel` |
| [`CategoryBlock`](#categoryblock) | `server` | stable | F29 | `CategoryBlockModel` |
| [`ForumRow`](#forumrow) | `server` | stable | F29 | `ForumRowSlotModel` |
| [`BoardStats`](#boardstats) | `server` | stable | F75 | `BoardStatsModel` |
| [`WhoIsOnline`](#whoisonline) | `server` | stable | F75 | `WhoIsOnlineModel` |
| [`ForumDisplay`](#forumdisplay) | `server` | stable | F30 | `ForumDisplayModel` |
| [`ThreadRow`](#threadrow) | `server` | stable | F30 | `ThreadRowSlotModel` |
| [`SubforumList`](#subforumlist) | `server` | stable | F30 | `SubforumListModel` |
| [`Pagination`](#pagination) | `server` | stable | F30 | `PaginationModel` |
| [`ThreadView`](#threadview) | `server` | stable | F31 | `ThreadViewModel` |
| [`PostBit`](#postbit) | `server` | stable | F31 | `PostBitSlotModel` |
| [`PostActions`](#postactions) | `server` | stable | F31 | `PostActionsSlotModel` |
| [`QuickReply`](#quickreply) | `client` | provisional | F45 | `QuickReplyModel` |
| [`PostForm`](#postform) | `server` | stable | F39 | `PostFormModel` |
| [`EditorToolbar`](#editortoolbar) | `client` | provisional | F45 | `EditorToolbarModel` |
| [`MemberProfile`](#memberprofile) | `server` | stable | F33 | `MemberProfileModel` |
| [`SearchForm`](#searchform) | `server` | stable | F73 | `SearchFormModel` |
| [`ForumJump`](#forumjump) | `server` | stable | F27 | `ForumJumpModel` |
| [`RedirectNotice`](#redirectnotice) | `server` | stable | F34 | `RedirectNoticeModel` |
| [`ErrorNotice`](#errornotice) | `server` | stable | F34 | `ErrorNoticeModel` |

## Slot reference

### Shell

`server` · stable · introduced by F27

The outermost frame: skip link, header, main landmark, footer. Wraps every page including the error pages.

Props: `ShellModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `viewer` | `ViewerModel` |  |
| `children` | `ReactNode` | optional |

### Header

`server` · stable · introduced by F27

Board title or logo, and the region the user panel sits in.

Props: `HeaderModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `homeHref` | `string` |  |
| `viewer` | `ViewerModel` |  |
| `navigation` | `readonly LinkModel[]` |  |
| `children` | `ReactNode` | optional |

### UserPanel

`server` · stable · introduced by F27

Greeting and account links, or the sign-in prompt for a guest. Varies by actor, which is why no page wrapping it may be cached globally.

Props: `UserPanelModel`

| Field | Type | Notes |
|---|---|---|
| `viewer` | `ViewerModel` |  |
| `links` | `readonly LinkModel[]` | Sign-in / register, or account links. Resolved by the app. |
| `unreadNotifications` | `number` | F55. `0` when there is nothing to show. |
| `unreadMessages` | `number` |  |
| `children` | `ReactNode` | optional — Account controls the app supplies — today, the log-out form. Log out cannot be a `LinkModel`: it is a POST to a Server Action, because a GET that ends a session is fired by every prefetcher and link scanner that touches the page. A Server Action reference is also not plain data and could never cross this contract, so the app renders the form and the theme decides where in the panel it sits. |

### Navigation

`server` · stable · introduced by F27

The breadcrumb trail. Board → category → forum → thread.

Props: `NavigationModel`

| Field | Type | Notes |
|---|---|---|
| `items` | `readonly LinkModel[]` |  |

### Footer

`server` · stable · introduced by F27

Board footer: copyright, timezone note, links.

Props: `FooterModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `links` | `readonly LinkModel[]` |  |
| `timezoneLabel` | `string` | Which zone `TimeModel.label`s were formatted in, for the footer note. |

### Notice

`server` · stable · introduced by F27

A board-wide announcement or a flash message. Server-rendered so a notice is present in the first response, not after hydration.

Props: `NoticeModel`

| Field | Type | Notes |
|---|---|---|
| `kind` | `'info' \| 'success' \| 'warning' \| 'error'` |  |
| `message` | `string` |  |
| `dismissHref` | `string \| null` |  |

### BoardIndex

`server` · stable · introduced by F29

The index page body: the ordered list of category blocks.

Props: `BoardIndexModel`

| Field | Type | Notes |
|---|---|---|
| `markAllReadAction` | `string \| null` | F32's "mark all read" — a form target, not a client handler. |
| `regions` | `{ /** One `CategoryBlock` per top-level category, already rendered. */ readonly categories: ReactNode readonly stats: ReactNode readonly online: ReactNode /** * F80's `index.footer` region: whatever plugins contributed, already * rendered and ordered by the host. * * Optional, which is what makes this a **minor** addition under the v1 * policy — a theme written against 1.0 keeps compiling and simply does not * render plugin output. Every region field below follows the same rule. */ readonly plugins?: ReactNode }` |  |

### CategoryBlock

`server` · stable · introduced by F29

One top-level category and the forum rows under it.

Props: `CategoryBlockModel`

| Field | Type | Notes |
|---|---|---|
| `category` | `ForumRowModel` |  |
| `children` | `ReactNode` | optional |

### ForumRow

`server` · stable · introduced by F29

One forum in a listing: title, description, counters, last post, subforum links.

Props: `ForumRowSlotModel`

| Field | Type | Notes |
|---|---|---|
| `forum` | `ForumRowModel` |  |

### BoardStats

`server` · stable · introduced by F75

Totals and newest member. Named now; F75 supplies the numbers.

Props: `BoardStatsModel`

| Field | Type | Notes |
|---|---|---|
| `threadCount` | `number` |  |
| `postCount` | `number` |  |
| `memberCount` | `number` |  |
| `newestMember` | `UserRefModel \| null` |  |
| `computedAt` | `TimeModel \| null` | When the totals were last rolled up, or null before the first run (F75). Part of the contract rather than a detail the app hides, because a theme that shows the numbers should be able to say how old they are — and "computed ten minutes ago" is the difference between a number that is stale and one that is wrong. |

### WhoIsOnline

`server` · stable · introduced by F75

The online list and its record. Named now; F75 supplies the data.

Props: `WhoIsOnlineModel`

| Field | Type | Notes |
|---|---|---|
| `guestCount` | `number` |  |
| `members` | `readonly OnlineMemberModel[]` |  |
| `total` | `number` | Members plus guests, as this reader is permitted to count them (F75). |
| `recordCount` | `number` |  |
| `recordAt` | `TimeModel \| null` |  |
| `fullListHref` | `string` | The full list, for a theme that shows only a summary here. |

### ForumDisplay

`server` · stable · introduced by F30

A forum page body: subforums, thread list, pagination.

Props: `ForumDisplayModel`

| Field | Type | Notes |
|---|---|---|
| `forum` | `ForumRowModel` |  |
| `newThreadHref` | `string \| null` |  |
| `markReadAction` | `string \| null` |  |
| `regions` | `{ readonly subforums: ReactNode /** One `ThreadRow` per thread. Empty-state markup is the theme's. */ readonly threads: ReactNode readonly pagination: ReactNode }` |  |

### ThreadRow

`server` · stable · introduced by F30

One thread in a listing: prefix, title, author, counters, last post.

Props: `ThreadRowSlotModel`

| Field | Type | Notes |
|---|---|---|
| `thread` | `ThreadRowModel` |  |
| `select` | `SelectionModel \| null` | F52's checkbox, or `null`. |

### SubforumList

`server` · stable · introduced by F30

The compact list of child forums shown above a thread list.

Props: `SubforumListModel`

| Field | Type | Notes |
|---|---|---|
| `forums` | `readonly ForumRowModel[]` |  |

### Pagination

`server` · stable · introduced by F30

Page links. Server-rendered and href-based: paging must work with JavaScript disabled (R5), so this can never become an island.

Props: `PaginationModel`

| Field | Type | Notes |
|---|---|---|
| `page` | `number` |  |
| `pageCount` | `number` |  |
| `pages` | `readonly { readonly page: number readonly href: string readonly isCurrent: boolean }[]` |  |
| `previousHref` | `string \| null` |  |
| `nextHref` | `string \| null` |  |

### ThreadView

`server` · stable · introduced by F31

A thread page body: the post list, pagination, reply affordance.

Props: `ThreadViewModel`

| Field | Type | Notes |
|---|---|---|
| `thread` | `ThreadRowModel` |  |
| `forum` | `LinkModel` |  |
| `replyHref` | `string \| null` |  |
| `markReadAction` | `string \| null` | F32: a native POST target for the last visible post on this page. |
| `regions` | `{ /** One `PostBit` per post on this page. */ readonly posts: ReactNode readonly pagination: ReactNode /** * The quick-reply island, or `null` when the viewer may not reply — in which * case nothing is rendered and no island bytes are shipped. */ readonly quickReply: ReactNode }` |  |

### PostBit

`server` · stable · introduced by F31

One post: author block, body, footer. **The** load-bearing server slot — see this file’s header for what marking it `client` costs.

Props: `PostBitSlotModel`

| Field | Type | Notes |
|---|---|---|
| `post` | `PostBitModel` |  |
| `select` | `SelectionModel \| null` | F52's checkbox, or `null`. A theme that ignores it loses only bulk actions. |
| `regions` | `{ /** The `PostActions` slot, rendered by the page. */ readonly actions: ReactNode /** F80's `postbit.badges` region, beside the author's name. */ readonly pluginBadges?: ReactNode /** F80's `postbit.footer` region, below the body. */ readonly pluginFooter?: ReactNode }` |  |

### PostActions

`server` · stable · introduced by F31

Per-post controls (quote, edit, report, moderate). Links and forms, not buttons with handlers, so they work without JavaScript.

Props: `PostActionsSlotModel`

| Field | Type | Notes |
|---|---|---|
| `actions` | `PostActionsModel` |  |
| `postId` | `number` |  |

### QuickReply

`client` · provisional · introduced by F45

The inline reply island at the foot of a thread. Enhances the full reply page; it never becomes the only way to reply.

Props: `QuickReplyModel`

| Field | Type | Notes |
|---|---|---|
| `action` | `string` |  |
| `threadId` | `number` |  |
| `placeholder` | `string` |  |
| `submitLabel` | `string` |  |
| `fullReplyHref` | `string` | Where the no-JS reply form lives, for when the island is not rendered. |

### PostForm

`server` · stable · introduced by F39

The composer page: subject, message, prefix, options. A native form posting to a Server Action — the editor toolbar is the island, not this.

Props: `PostFormModel`

| Field | Type | Notes |
|---|---|---|
| `mode` | `'thread' \| 'reply' \| 'edit'` |  |
| `heading` | `string` | e.g. "Post a new thread in General". |
| `cancelHref` | `string` | Where a cancel link returns to — the forum, or the thread being replied to. |
| `cancelLabel` | `string` |  |
| `errorMessage` | `string \| null` |  |
| `regions` | `{ /** The app-rendered `<form>` carrying the Server Action and its controls. */ readonly form: ReactNode /** * The `EditorToolbar` island, or `null`. A `null` here must leave a working * plain-textarea form: the island enhances, it never enables (R5). */ readonly toolbar: ReactNode }` |  |

### EditorToolbar

`client` · provisional · introduced by F45

BBCode buttons, preview, attachment picker. Mounted beside the textarea; removing it must leave a working plain-textarea form.

Props: `EditorToolbarModel`

| Field | Type | Notes |
|---|---|---|
| `textareaId` | `string` | The textarea's `id`; the island attaches to it rather than owning it. |
| `buttons` | `readonly { readonly tag: string readonly label: string readonly icon: string \| null }[]` |  |
| `previewAction` | `string \| null` |  |

### MemberProfile

`server` · stable · introduced by F33

A member’s profile page body: identity, stats, recent activity.

Props: `MemberProfileModel`

| Field | Type | Notes |
|---|---|---|
| `user` | `UserRefModel` |  |
| `avatarUrl` | `string \| null` |  |
| `title` | `string \| null` |  |
| `joinedAt` | `TimeModel` |  |
| `lastVisitAt` | `TimeModel \| null` |  |
| `postCount` | `number` |  |
| `signatureHtml` | `string \| null` |  |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | F59's custom fields, already filtered by visibility. |
| `actions` | `readonly LinkModel[]` |  |
| `regions` | `{ /** F80's `profile.panel` region. */ readonly plugins?: ReactNode }` | optional |

### SearchForm

`server` · stable · introduced by F73

The search form. A GET form with named inputs, so a search is a URL that can be linked and cached.

Props: `SearchFormModel`

| Field | Type | Notes |
|---|---|---|
| `action` | `string` | Where the form submits. A GET form: a search is a URL. |
| `fields` | `{ readonly query: string readonly forum: string readonly sort: string }` | The names to give the controls, owned by the app. |
| `query` | `string` |  |
| `maxQueryLength` | `number` | The server's limit, so the browser can refuse over-long input first. |
| `forums` | `readonly OptionModel[]` | Forums this viewer may search. The first option is "everywhere". |
| `sorts` | `readonly OptionModel[]` |  |
| `hint` | `string \| null` | Guidance for an empty form: quoting, exclusion. `null` once submitted. |
| `errorMessage` | `string \| null` |  |

### ForumJump

`server` · stable · introduced by F27

The jump box at the foot of every page. A GET form with a submit control, never a select that navigates on change — choosing an option is not committing to it, and arrow-keying through one would teleport a keyboard user to the first forum in the list.

Props: `ForumJumpModel`

| Field | Type | Notes |
|---|---|---|
| `action` | `string` | Where the form submits. GET, because a jump is a navigation. |
| `field` | `string` | The query-parameter name to give the select. The app owns it. |
| `forums` | `readonly ForumJumpOption[]` | Visible forums, in tree order. |
| `submitLabel` | `string` | The label for the submit control. Always rendered. |
| `label` | `string` | Accessible name for the control, e.g. "Jump to forum". |

### RedirectNotice

`server` · stable · introduced by F34

The MyBB-style interstitial: "your post was made, continuing in a moment", with a real link for anyone the meta refresh does not carry.

Props: `RedirectNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `message` | `string` |  |
| `targetHref` | `string` |  |
| `delaySeconds` | `number` |  |

### ErrorNotice

`server` · stable · introduced by F34

The themed body of an error or not-found page. Must not depend on the database: it is what renders when the database is the thing that failed.

Props: `ErrorNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `status` | `number` |  |
| `title` | `string` |  |
| `message` | `string` |  |
| `homeHref` | `string` |  |
| `requestId` | `string \| null` | F09's request id, so a user can quote it in a report. |

## Shared models

Referenced by the models above. Same promise: a field of a shared model reached
from a stable slot is stable.

### ForumJumpOption

| Field | Type | Notes |
|---|---|---|
| `value` | `string` |  |
| `label` | `string` |  |
| `depth` | `number` | 0 for a top-level category. The theme chooses how to show nesting. |
| `isCategory` | `boolean` | A category is a heading, not a destination — rendered disabled. |
| `isSelected` | `boolean` |  |

### ForumRowModel

Submitted as the form value. Opaque to the theme. readonly value: string readonly label: string readonly isSelected: boolean } /* ------------------------------------------------------------------ * Listing models ------------------------------------------------------------------

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `title` | `string` |  |
| `description` | `string \| null` |  |
| `href` | `string` |  |
| `type` | `'category' \| 'forum' \| 'link'` | `link` rows navigate away and have no counters. |
| `threadCount` | `number` |  |
| `postCount` | `number` |  |
| `lastPost` | `LastPostModel \| null` |  |
| `isUnread` | `boolean` | F32. `false` for a guest, who has no read state. |
| `subforums` | `readonly LinkModel[]` |  |

### LastPostModel

The last post in a forum or thread, as a listing shows it.

| Field | Type | Notes |
|---|---|---|
| `threadTitle` | `string` |  |
| `href` | `string` | Deep link to the post itself, not the thread's first page. |
| `author` | `UserRefModel` |  |
| `at` | `TimeModel` |  |

### LinkModel

A resolved link. Themes never build hrefs; the app owns URL shape.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `href` | `string` |  |

### OnlineMemberModel

One visitor in the online list (F75). `location` is **already resolved against the reader**: a forum they may not see arrives as the bare label, never as a title with a link. The theme renders what it is given and cannot leak what it was not.

| Field | Type | Notes |
|---|---|---|
| `userId` | `number \| null` | from `UserRefModel` — `null` when the account was deleted; `username` is still shown. |
| `username` | `string` | from `UserRefModel` |
| `profileHref` | `string \| null` | from `UserRefModel` |
| `location` | `{ readonly label: string; readonly href: string \| null }` | Where they are, as this reader may be told. Never null — see `label`. |
| `isInvisible` | `boolean` | True only for staff, who see hidden members marked rather than absent. |
| `lastSeen` | `TimeModel` |  |

### OptionModel

One choice in a `<select>` or a radio group, with the current one marked. `isSelected` rather than a separate `selected` field on the parent: a theme renders options in a loop, and "which of these is current" answered per option is one comparison the theme does not have to write — and cannot write wrongly by comparing a string to a number.

| Field | Type | Notes |
|---|---|---|
| `value` | `string` | Submitted as the form value. Opaque to the theme. |
| `label` | `string` |  |
| `isSelected` | `boolean` |  |

### PostActionsModel

| Field | Type | Notes |
|---|---|---|
| `quoteHref` | `string \| null` |  |
| `editHref` | `string \| null` |  |
| `restoreHref` | `string \| null` | Where a soft-deleted post is put back (F41). A separate field rather than a second meaning for `editHref`, because the two are never both offered: a deleted post cannot be edited, and a visible one has nothing to restore. A theme that renders both gets exactly one. |
| `reportHref` | `string \| null` |  |
| `warnHref` | `string \| null` | Warn this post's author, citing this post (F53). Present for moderators only, and `null` for a post whose author is the viewer or a deleted account. Separate from `moderateHref` because a warning is aimed at the *person* and the post is only the evidence — which is also why the link carries the post id rather than living on the post's own moderation controls. |
| `moderateHref` | `string \| null` | Reserved for per-post moderation controls that are not inline (F54). Still `null` everywhere: F52 put per-post moderation on checkboxes and a bar rather than a per-post link, so nothing fills this yet. It stays in the contract because F54's ModCP is where a per-post moderation *page* would live, and removing a public field to add it back next feature is worse than a documented `null`. |
| `rateHref` | `string \| null` | Rate this post's author, for this post (F62). Null on your own post, on a board with reputation off, and for anybody without the permission. It carries the post so the rating is attached to *this* post rather than to the author generally — which is what makes one rating per post a meaningful rule. |

### PostAttachmentModel

One file attached to a post (F42).

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `filename` | `string` | Sanitised, and always ending in the extension the *bytes* imply. |
| `size` | `string` | Already formatted — "1.4 MB" — because a theme is not a unit converter. |
| `isImage` | `boolean` | Whether the board is willing to show this inline rather than link it. |
| `href` | `string` | The download. Permission is re-checked on every fetch. |
| `thumbnailHref` | `string \| null` |  |
| `width` | `number \| null` |  |
| `height` | `number \| null` |  |

### PostAuthorModel

The author block beside a post.

| Field | Type | Notes |
|---|---|---|
| `userId` | `number \| null` | from `UserRefModel` — `null` when the account was deleted; `username` is still shown. |
| `username` | `string` | from `UserRefModel` |
| `profileHref` | `string \| null` | from `UserRefModel` |
| `avatarUrl` | `string \| null` |  |
| `title` | `string \| null` | Usergroup title or custom user title. |
| `postCount` | `number` |  |
| `joinedAt` | `TimeModel \| null` |  |
| `signatureHtml` | `string \| null` | Pre-rendered BBCode (F36). Trusted output of the sanitising renderer. |
| `isOnline` | `boolean` |  |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | F59's custom fields, for the ones an operator marked for the postbit and this viewer may see. The same `{label, value}` shape `MemberProfileModel.fields` uses, and **plain text** for the same reason: it is rendered as text by the theme, and a field that could carry markup is stored XSS on the board's heaviest page. Empty on a board with no custom fields, which is most of them. |

### PostBitModel

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `number` | `number` | Position within the thread, 1-based. What "#12" in the corner means. |
| `permalink` | `string` |  |
| `author` | `PostAuthorModel` |  |
| `bodyHtml` | `string` | Pre-rendered BBCode (F36). |
| `postedAt` | `TimeModel` |  |
| `editedNote` | `string \| null` | "Last edited by X on Y", already assembled, or `null`. |
| `isFirstPost` | `boolean` |  |
| `visibility` | `'visible' \| 'unapproved' \| 'deleted'` | F47: a moderator sees deleted and unapproved posts, marked as such. |
| `ignored` | `{ readonly authorUsername: string /** Same page, this post revealed. A GET: revealing changes nothing. */ readonly revealHref: string } \| null` | F61. Set when this viewer ignores the author and has not revealed this post; `null` otherwise, which is the case on almost every post. The body is **withheld server-side** when this is set — `bodyHtml` is empty, the signature and custom fields are gone — rather than hidden with CSS, because "ignored" that ships the text to the browser is a preference rather than a feature. The post keeps its place and its number: filtering it out would give every viewer a different page size and make "#12" mean different posts to different people. A theme renders the placeholder and the link. Both are required — a hidden post with no way to see it is a hole in a conversation. |
| `attachments` | `readonly PostAttachmentModel[]` | The files attached to this post (F42). Empty on almost every post, and empty rather than absent so a theme has one shape to render. **Every entry is already downloadable**: a `pending` upload — one whose re-encode has not finished — and a failed one are not in this list, because a link to a file that is not there yet is worse than the file appearing a minute later. `thumbnailHref` is `null` for anything that is not an image, and for an image small enough that a thumbnail would be the same picture again. A theme showing an image inline uses `thumbnailHref ?? href` and gets the right answer in both cases. |
| `actions` | `PostActionsModel` |  |

### PrefixModel

A thread prefix (F37 supplies styling from `token`).

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `token` | `string \| null` |  |

### SelectionModel

One inline-moderation checkbox (F52), or `null` when this viewer has no business selecting rows. Plain data, and it has to be: the *form* it belongs to carries a Server Action reference, and D38 settled that such references never cross the theme contract. So the app renders the form — below the listing, where a bar of buttons belongs — and the theme renders a checkbox that says which form it belongs to. `formId` is the whole trick, and it is why this works with scripting off. HTML's `form` attribute associates a control with a form **by id, anywhere in the document**, so the checkboxes can live inside table rows, list items or article elements without the listing having to be wrapped in a `<form>` — which it cannot be, because `ForumDisplay` already renders a mark-read form and nested forms are not a thing browsers will parse.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The field name every checkbox shares. |
| `value` | `string` | This row's value, opaque to the theme. |
| `formId` | `string` | The `id` of the app-rendered form these checkboxes submit with. |
| `label` | `string` | For a visually-hidden label: "Select 'How do I …' for moderation". |

### ThreadRowModel

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `title` | `string` |  |
| `href` | `string` |  |
| `prefix` | `PrefixModel \| null` |  |
| `author` | `UserRefModel` |  |
| `replyCount` | `number` |  |
| `viewCount` | `number` |  |
| `isSticky` | `boolean` |  |
| `isLocked` | `boolean` |  |
| `isUnread` | `boolean` |  |
| `isMoved` | `boolean` | Set when the thread is a move stub; the row renders as a redirect. |
| `lastPost` | `LastPostModel \| null` |  |

### TimeModel

A timestamp, in both forms a template needs. See this file's header.

| Field | Type | Notes |
|---|---|---|
| `iso` | `string` | ISO-8601 UTC. Goes in `<time datetime>`; never rendered raw. |
| `label` | `string` | Preformatted in the viewer's timezone, e.g. "Today, 09:14" or "12 Mar 2026". |

### UserRefModel

A user as they appear attached to content.

| Field | Type | Notes |
|---|---|---|
| `userId` | `number \| null` | `null` when the account was deleted; `username` is still shown. |
| `username` | `string` |  |
| `profileHref` | `string \| null` |  |

### ViewerModel

Who is looking. The only actor data a theme is given.

| Field | Type | Notes |
|---|---|---|
| `isGuest` | `boolean` |  |
| `userId` | `number \| null` | `null` for a guest. |
| `username` | `string \| null` |  |
| `profileHref` | `string \| null` |  |
| `avatarUrl` | `string \| null` |  |
| `canAccessAdminCp` | `boolean` | Whether to render the admin-panel link. A *rendering* hint, resolved by the Authorizer already — a theme must never conclude anything about permissions on its own, and R6 keeps themes out of authorization entirely. |
| `canAccessModCp` | `boolean` | Whether to render the moderation link (F48). Same shape and same rule as `canAccessAdminCp`: a rendering hint the Authorizer has already decided. Group-level only, which is a real limitation rather than an oversight: a per-forum appointee's queue exists and is reachable, but answering "does this person moderate anything" for them costs the tree, and the shell renders on every page. F54's ModCP is where that link earns its query. |

## Scheduled removals

Nothing is deprecated in v1.1. Nothing can be: this is the first
frozen version, so there is no earlier promise to withdraw.
