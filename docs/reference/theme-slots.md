# Theme slots and view models

<!--
  GENERATED FILE — do not edit.

  Written by scripts/theme-api-docs.mjs from packages/theme-kit/src/{slots,api,
  view-models}.ts. Run `pnpm theme:docs` after changing any of them; `pnpm verify`
  and CI run `pnpm theme:docs:check` and fail when this file and the code disagree.
-->

**theme-kit v0.22.** 36 slots: 36 stable, 0 provisional, 0 deprecated.

What the marks mean, and how something is removed, is in
[`themes.md`](../customization/themes.md). In short: a **stable** slot and the fields of its
model do not change before the next major; a **provisional** slot is named but not yet rendered
by any page, so its model may change in a minor release; a **deprecated** slot still
works and has a removal scheduled below.

## Every slot

| Slot | Kind | Stability | Props |
|---|---|---|---|
| [`Shell`](#shell) | `server` | stable | `ShellModel` |
| [`Header`](#header) | `server` | stable | `HeaderModel` |
| [`UserPanel`](#userpanel) | `server` | stable | `UserPanelModel` |
| [`Navigation`](#navigation) | `server` | stable | `NavigationModel` |
| [`Footer`](#footer) | `server` | stable | `FooterModel` |
| [`Notice`](#notice) | `server` | stable | `NoticeModel` |
| [`Announcement`](#announcement) | `server` | stable | `AnnouncementModel` |
| [`BoardIndex`](#boardindex) | `server` | stable | `BoardIndexModel` |
| [`CategoryBlock`](#categoryblock) | `server` | stable | `CategoryBlockModel` |
| [`ForumRow`](#forumrow) | `server` | stable | `ForumRowSlotModel` |
| [`BoardStats`](#boardstats) | `server` | stable | `BoardStatsModel` |
| [`WhoIsOnline`](#whoisonline) | `server` | stable | `WhoIsOnlineModel` |
| [`LatestThreads`](#latestthreads) | `server` | stable | `LatestThreadsModel` |
| [`LatestPosts`](#latestposts) | `server` | stable | `LatestPostsModel` |
| [`ForumDisplay`](#forumdisplay) | `server` | stable | `ForumDisplayModel` |
| [`ThreadRow`](#threadrow) | `server` | stable | `ThreadRowSlotModel` |
| [`SubforumList`](#subforumlist) | `server` | stable | `SubforumListModel` |
| [`Pagination`](#pagination) | `server` | stable | `PaginationModel` |
| [`ThreadView`](#threadview) | `server` | stable | `ThreadViewModel` |
| [`PostBit`](#postbit) | `server` | stable | `PostBitSlotModel` |
| [`PostActions`](#postactions) | `server` | stable | `PostActionsSlotModel` |
| [`QuickReply`](#quickreply) | `client` | stable | `QuickReplyModel` |
| [`PostForm`](#postform) | `server` | stable | `PostFormModel` |
| [`EditorToolbar`](#editortoolbar) | `client` | stable | `EditorToolbarModel` |
| [`MemberProfile`](#memberprofile) | `server` | stable | `MemberProfileModel` |
| [`SearchForm`](#searchform) | `server` | stable | `SearchFormModel` |
| [`SearchResults`](#searchresults) | `server` | stable | `SearchResultsModel` |
| [`DiscoveryView`](#discoveryview) | `server` | stable | `DiscoveryViewModel` |
| [`PanelShell`](#panelshell) | `server` | stable | `PanelShellModel` |
| [`PanelNav`](#panelnav) | `server` | stable | `PanelNavModel` |
| [`PanelPage`](#panelpage) | `server` | stable | `PanelPageModel` |
| [`PanelSection`](#panelsection) | `server` | stable | `PanelSectionModel` |
| [`AuthPage`](#authpage) | `server` | stable | `AuthPageModel` |
| [`ForumJump`](#forumjump) | `server` | stable | `ForumJumpModel` |
| [`RedirectNotice`](#redirectnotice) | `server` | stable | `RedirectNoticeModel` |
| [`ErrorNotice`](#errornotice) | `server` | stable | `ErrorNoticeModel` |

## Slot reference

### Shell

`server` · stable

The outermost frame: skip link, header, main landmark, footer. Wraps every page including the error pages.

Props: `ShellModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `viewer` | `ViewerModel` |  |
| `children` | `ReactNode` | optional |

### Header

`server` · stable

Board title or logo, and the region the user panel sits in.

Props: `HeaderModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `homeHref` | `string` |  |
| `viewer` | `ViewerModel` |  |
| `navigation` | `readonly LinkModel[]` |  |
| `logo` | `LogoModel \| undefined` | optional — The board's logo, when it has one. A theme that ignores this renders the board's name and is still correct — which is what makes the field additive rather than breaking. A theme that uses it should keep the name as the link's accessible content when there is no logo, because the header is the only link home on most pages. |
| `children` | `ReactNode` | optional |

### UserPanel

`server` · stable

Greeting and account links, or the sign-in prompt for a guest. Varies by actor, which is why no page wrapping it may be cached globally.

Props: `UserPanelModel`

| Field | Type | Notes |
|---|---|---|
| `viewer` | `ViewerModel` |  |
| `links` | `readonly LinkModel[]` | Sign-in / register, or account links. Resolved by the app. |
| `unreadNotifications` | `CountModel` | `value` is `0` when there is nothing to show. |
| `unreadMessages` | `CountModel` |  |
| `notificationsHref` | `string` | optional — Where the two counts above lead, so a theme can make them clickable. A count that cannot be acted on is a notification the reader has to go hunting for. Both are absent for a guest, who has neither. Themes read these rather than searching `links` for the one labelled "Notifications", which two of them were doing and which breaks the moment that label is reworded or translated. |
| `messagesHref` | `string` | optional |
| `regions` | `{ /** * The notifications menu the app supplies — a single control that opens the * reader's notifications, private messages and, for staff, the moderation * queue in tabs, marks them seen and links each one through (0.16). * * It is app-rendered rather than modelled field by field because it is an * interactive island carrying Server Actions — the same reason logging out * arrives as `children` and the quick-reply island as a region. A theme * places it where the two unread counts used to sit; the island renders its * own no-JavaScript fallback, so a theme that renders this needs no separate * badge markup. Absent for a guest and on a board with neither service, and * a theme that ignores it falls back to `unreadNotifications` and * `unreadMessages`, which is what makes the field additive. */ readonly notifications?: ReactNode }` | optional |
| `children` | `ReactNode` | optional — Account controls the app supplies — today, the log-out form. Log out cannot be a `LinkModel`: it is a POST to a Server Action, because a GET that ends a session is fired by every prefetcher and link scanner that touches the page. A Server Action reference is also not plain data and could never cross this contract, so the app renders the form and the theme decides where in the panel it sits. |

### Navigation

`server` · stable

The breadcrumb trail. Board → category → forum → thread.

Props: `NavigationModel`

| Field | Type | Notes |
|---|---|---|
| `items` | `readonly LinkModel[]` |  |

### Footer

`server` · stable

Board footer: copyright, timezone note, links.

Props: `FooterModel`

| Field | Type | Notes |
|---|---|---|
| `boardTitle` | `string` |  |
| `links` | `readonly LinkModel[]` |  |
| `timezoneLabel` | `string` | Which zone `TimeModel.label`s were formatted in, for the footer note. |
| `poweredBy` | `LinkModel` | optional — What the board runs on, and where to read about it (0.8). A `LinkModel` and not a hardcoded string in each theme, for the reason every other piece of footer text is one: the app owns the words and the URL, so they are written once and a theme that wants to place the attribution somewhere else in its layout can, without owning a copy of them. Optional, which is what makes it a minor rather than a major: a theme written against 0.7 compiles and runs unchanged, and simply does not render it. The two themes in this repository do. |
| `regions` | `{ readonly controls?: ReactNode }` | optional — App-rendered controls the footer hosts: the forum-jump form and the appearance switcher (0.20). Both used to be full-width bars of their own stacked above the footer, which left the foot of every page reading as three separate rules. They are a GET form and Server-Action forms the app owns, so they cross the contract the way the log-out form does — as a rendered node the theme places, not data it could rebuild. Optional the way `poweredBy` is: a theme written against 0.19 compiles and runs unchanged — but one that never renders it costs its readers the jump box and the appearance controls, so place it rather than drop it. The bundled themes render it as a right-aligned row above the footer's own line of text. |

### Notice

`server` · stable

A board-wide announcement or a flash message. Server-rendered so a notice is present in the first response, not after hydration.

Props: `NoticeModel`

| Field | Type | Notes |
|---|---|---|
| `kind` | `'info' \| 'success' \| 'warning' \| 'error'` |  |
| `message` | `string` |  |
| `dismissHref` | `string \| null` |  |

### Announcement

`server` · stable

One announcement: a dated, authored notice shown above the forums. Distinct from Notice, which is a flash message about what the viewer just did — these are for everybody and last until they expire.

Props: `AnnouncementModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `bodyHtml` | `string` | Trusted HTML, from `@meith/markdown`'s own renderer — the same contract as a post body, and the reason a theme inserts it rather than escaping it. |
| `postedBy` | `UserRefModel \| null` |  |
| `postedAt` | `TimeModel` |  |
| `forum` | `LinkModel \| null` | The forum it belongs to, or `null` when it is board-wide. |

### BoardIndex

`server` · stable

The index page body: the ordered list of category blocks.

Props: `BoardIndexModel`

| Field | Type | Notes |
|---|---|---|
| `markAllReadAction` | `string \| null` | The "mark all read" target — a form target, not a client handler. |
| `regions` | `{ /** One `CategoryBlock` per top-level category, already rendered. */ readonly categories: ReactNode readonly stats: ReactNode readonly online: ReactNode /** * The self-refreshing pair: newest threads and newest posts, already * rendered, or absent on a board that cannot answer either question. * * **One region rather than two, and that is the contract rather than a * convenience.** The pair is refreshed by a single round trip while the page * is open, so it arrives as one node; two regions would be two polls of the * same board for the same reason, or one poll that could only update half of * what a theme had placed. A theme places it — the default puts it at the * top of a sidebar — but does not take it apart. * * Optional, so a theme written against an earlier minor compiles and simply * does not show it. Same rule as every other region field here. */ readonly latest?: ReactNode /** * The `index.footer` region: whatever plugins contributed, already * rendered and ordered by the host. * * Optional, which is what makes this a **minor** addition under the * versioning policy — a theme written against 0.1 keeps compiling and simply * does not render plugin output. Every region field below follows the same rule. */ readonly plugins?: ReactNode /** * Live announcements, already rendered — one `Announcement` per row, * or absent when there are none. * * Optional for the same reason the plugin region is, and under the same * policy: a theme written against an earlier minor compiles and simply does * not show them. */ readonly announcements?: ReactNode }` |  |

### CategoryBlock

`server` · stable

One top-level category and the forum rows under it.

Props: `CategoryBlockModel`

| Field | Type | Notes |
|---|---|---|
| `category` | `ForumRowModel` |  |
| `children` | `ReactNode` | optional |

### ForumRow

`server` · stable

One forum in a listing: title, description, counters, last post, subforum links.

Props: `ForumRowSlotModel`

| Field | Type | Notes |
|---|---|---|
| `forum` | `ForumRowModel` |  |

### BoardStats

`server` · stable

Board totals and the newest member.

Props: `BoardStatsModel`

| Field | Type | Notes |
|---|---|---|
| `threadCount` | `CountModel` |  |
| `postCount` | `CountModel` |  |
| `memberCount` | `CountModel` |  |
| `newestMember` | `UserRefModel \| null` |  |
| `computedAt` | `TimeModel \| null` | When the totals were last rolled up, or null before the first run. Part of the contract rather than a detail the app hides, because a theme that shows the numbers should be able to say how old they are — and "computed ten minutes ago" is the difference between a number that is stale and one that is wrong. |

### WhoIsOnline

`server` · stable

The online list and its record.

Props: `WhoIsOnlineModel`

| Field | Type | Notes |
|---|---|---|
| `guestCount` | `CountModel` |  |
| `members` | `readonly OnlineMemberModel[]` |  |
| `memberCount` | `CountModel` | How many members are listed. Render this rather than `members.length`. |
| `total` | `CountModel` | Members plus guests, as this reader is permitted to count them. |
| `recordCount` | `CountModel` |  |
| `recordAt` | `TimeModel \| null` |  |
| `fullListHref` | `string` | The full list, for a theme that shows only a summary here. |

### LatestThreads

`server` · stable

The newest threads on the board, for the index sidebar. Server, not client, even though the panel refreshes itself: the app polls a Server Action that renders this slot again, so the live half is one island around the region rather than a client component per panel.

Props: `LatestThreadsModel`

| Field | Type | Notes |
|---|---|---|
| `threads` | `readonly LatestThreadModel[]` |  |
| `capturedAt` | `TimeModel` |  |

### LatestPosts

`server` · stable

The newest posts on the board, with an excerpt of each. Same server rendering and same refresh path as LatestThreads.

Props: `LatestPostsModel`

| Field | Type | Notes |
|---|---|---|
| `posts` | `readonly LatestPostModel[]` |  |
| `capturedAt` | `TimeModel` |  |

### ForumDisplay

`server` · stable

A forum page body: subforums, thread list, pagination.

Props: `ForumDisplayModel`

| Field | Type | Notes |
|---|---|---|
| `forum` | `ForumRowModel` |  |
| `newThreadHref` | `string \| null` |  |
| `markReadAction` | `string \| null` |  |
| `regions` | `{ /** * Controls scoped to this forum — the thread ordering, and the follow * form for a member who may subscribe. Rendered by the route because both * carry a Server Action or a URL contract the theme does not own. * * **A theme renders this under its heading, not above it.** That placement * is the reason the field exists: these were app-rendered strips stacked * *before* `ForumDisplay`, so the first thing on a forum page was a filter * with nothing yet to say what it filtered. A control belongs after the * thing it acts on has been named. * * Optional, which is what makes it a **minor** addition under the * versioning policy — a theme written against 0.3 keeps compiling. * * Only what acts on the listing *below* it belongs here. Following the * forum is in `afterContent`, for the reason given there. */ readonly tools?: ReactNode readonly subforums: ReactNode /** One `ThreadRow` per thread. Empty-state markup is the theme's. */ readonly threads: ReactNode readonly pagination: ReactNode /** * This forum's announcements *and* the board's — an announcement being * board-wide would mean little if it appeared only on the index, which is * the page fewest people arrive on. */ readonly announcements?: ReactNode /** * Controls for somebody who has finished with the page — today, the form * that follows this forum. * * A theme renders it after the listing. "Do you want to hear about this * forum?" is a question you can only answer once you have seen what is in * it, and asked above the threads it is a panel between a reader and the * thing they came for. The ordering tabs stay at the top in `tools`, * because those act on the list underneath them. */ readonly afterContent?: ReactNode }` |  |

### ThreadRow

`server` · stable

One thread in a listing: prefix, title, author, counters, last post.

Props: `ThreadRowSlotModel`

| Field | Type | Notes |
|---|---|---|
| `thread` | `ThreadRowModel` |  |
| `select` | `SelectionModel \| null` | The inline-moderation checkbox, or `null`. |
| `regions` | `{ /** * The `threadrow.badges` region, beside the thread's title (0.22). * * Filled from a single per-page call rather than one per row — a forum page * lists twenty threads on a tight budget, so the region runs once with the * whole page and hands each row its badges. Optional, which is what makes it * additive: a theme written against 0.21 compiles and simply shows no plugin * badges. Absent on a row no plugin marked; a theme places it wherever a * thread's own flags (pinned, locked) sit. */ readonly pluginBadges?: ReactNode }` | optional |

### SubforumList

`server` · stable

The compact list of child forums shown above a thread list.

Props: `SubforumListModel`

| Field | Type | Notes |
|---|---|---|
| `forums` | `readonly ForumRowModel[]` |  |

### Pagination

`server` · stable

Page links. Server-rendered and href-based: paging must work with JavaScript disabled, so this can never become an island.

Props: `PaginationModel`

| Field | Type | Notes |
|---|---|---|
| `page` | `number` |  |
| `pageCount` | `number` |  |
| `pageCountIsExact` | `boolean` | Whether `pageCount` is the real number of pages or only what has been proved so far. A keyset-paged list knows the page it is on and whether another one follows; it does not know how many there are, and counting rows to find out is the query the cursor exists to avoid. So `pageCount` is a floor when this is `false`, and a theme that prints "3 of 4" from it is telling the reader something nobody checked. Print the page on its own instead, and keep "of N" for the lists that do know. |
| `pages` | `readonly { readonly page: number readonly href: string readonly isCurrent: boolean }[]` |  |
| `previousHref` | `string \| null` |  |
| `nextHref` | `string \| null` |  |

### ThreadView

`server` · stable

A thread page body: the post list, pagination, reply affordance.

Props: `ThreadViewModel`

| Field | Type | Notes |
|---|---|---|
| `thread` | `ThreadRowModel` |  |
| `forum` | `LinkModel` |  |
| `replyHref` | `string \| null` |  |
| `markReadAction` | `string \| null` | A native POST target for the last visible post on this page. |
| `regions` | `{ /** * Controls scoped to this thread — following it, rating it, its poll, and * the moderator's thread tools. Rendered by the route, for the reason * every app-rendered region exists: each one carries a Server Action. * * **A theme renders this under its heading, not above it**, and the same * history is behind this field as behind `ForumDisplayModel`'s. Four of * these strips used to stack before `ThreadView`, so a thread opened on a * phone began with a follow control, a star rating and a poll, and the * title of the thing being followed, rated and voted on was a screen * further down. * * Only what belongs *before* the posts: the moderator's bar, and the * poll, which is content rather than a control. Rating and following are * in `afterContent`. * * Optional under the versioning policy: a theme written against 0.3 compiles * and simply does not offer them. */ readonly tools?: ReactNode /** One `PostBit` per post on this page. */ readonly posts: ReactNode readonly pagination: ReactNode /** * Controls for a reader who has reached the end — rating the thread, and * following it. * * A theme renders it after the posts and **before** the quick reply, which * is the order the two are wanted in: somebody who has just read fifty * posts is deciding what they think and whether to keep hearing about it, * and then whether to answer. Both used to be above the first post, where * they were asking for a verdict on something the reader had not read yet. */ readonly afterContent?: ReactNode /** * The quick-reply island, or `null` when the viewer may not reply — in which * case nothing is rendered and no island bytes are shipped. */ readonly quickReply: ReactNode }` |  |

### PostBit

`server` · stable

One post: author block, body, footer. **The** load-bearing server slot — see this file’s header for what marking it `client` costs.

Props: `PostBitSlotModel`

| Field | Type | Notes |
|---|---|---|
| `post` | `PostBitModel` |  |
| `select` | `SelectionModel \| null` | The inline-moderation checkbox, or `null`. A theme that ignores it loses only bulk actions. |
| `regions` | `{ /** The `PostActions` slot, rendered by the page. */ readonly actions: ReactNode /** The `postbit.badges` region, beside the author's name. */ readonly pluginBadges?: ReactNode /** The `postbit.footer` region, below the body. */ readonly pluginFooter?: ReactNode }` |  |

### PostActions

`server` · stable

Per-post controls (quote, edit, report, moderate). Links and forms, not buttons with handlers, so they work without JavaScript.

Props: `PostActionsSlotModel`

| Field | Type | Notes |
|---|---|---|
| `actions` | `PostActionsModel` |  |
| `postId` | `number` |  |
| `children` | `ReactNode` | optional — App-rendered controls that belong beside the post's own actions — today, the multi-quote island. It is `children` for the reason logging out is: the button is a client island holding browser state, and neither a component nor a handler can cross this contract as data. Before this field the page had nowhere to put it but `PostBitModel.regions.pluginFooter`, so every post on the board carried a second bordered row containing one control — the plugin region used as a parking space, and a visible band of furniture per post as the price. Additive under the versioning policy, and `children` is already exempt from the plain-data rule. |

### QuickReply

`client` · stable

The inline reply island at the foot of a thread. Enhances the full reply page; it never becomes the only way to reply.

Props: `QuickReplyModel`

| Field | Type | Notes |
|---|---|---|
| `threadId` | `number` |  |
| `placeholder` | `string` |  |
| `submitLabel` | `string` |  |
| `fullReplyHref` | `string` | Where the no-JS reply form lives, for when the island is not rendered. |
| `children` | `ReactNode` | optional |

### PostForm

`server` · stable

The composer page: subject, message, prefix, options. A native form posting to a Server Action — the editor toolbar is the island, not this.

Props: `PostFormModel`

| Field | Type | Notes |
|---|---|---|
| `mode` | `'thread' \| 'reply' \| 'edit'` |  |
| `heading` | `string` | e.g. "Post a new thread in General". |
| `cancelHref` | `string` | Where a cancel link returns to — the forum, or the thread being replied to. |
| `cancelLabel` | `string` |  |
| `errorMessage` | `string \| null` |  |
| `regions` | `{ /** The app-rendered `<form>` carrying the Server Action and its controls. */ readonly form: ReactNode /** * Kept for a theme that wants a toolbar affordance of its own at the top of * the composer. The built-in composer no longer fills it: a formatting * toolbar belongs against the box it formats, not at the head of a card a * subject field and a prefix picker can sit below, so the `EditorToolbar` * island renders inside `form`, joined to the message textarea, and this is * `null` there. A `null` must leave a working plain-textarea form: the * island enhances, it never enables. */ readonly toolbar: ReactNode }` |  |

### EditorToolbar

`client` · stable

Formatting toolbar, preview, attachment picker. Mounted beside the textarea; removing it must leave a working plain-textarea form.

Props: `EditorToolbarModel`

| Field | Type | Notes |
|---|---|---|
| `textareaId` | `string` | The textarea's `id`; the island attaches to it rather than owning it. |
| `groupLabel` | `string` | Accessible name for the toolbar's `role="group"`. |
| `buttons` | `readonly EditorToolbarButtonModel[]` |  |
| `attachment` | `{ readonly inputId: string; readonly label: string } \| null` | The attachment picker, or `null` where this composer takes none. `inputId` names an app-rendered `<input type="file" hidden>` elsewhere on the page — the upload itself is a Server Action the app owns, so a theme never handles the file. A button that calls `.click()` on the element that id names opens the picker; like every other button here, that is an enhancement over a plain-textarea form, not what makes the form work. |
| `previewAction` | `string \| null` |  |

### MemberProfile

`server` · stable

A member’s profile page body: identity, stats, recent activity.

Props: `MemberProfileModel`

| Field | Type | Notes |
|---|---|---|
| `user` | `UserRefModel` |  |
| `avatarUrl` | `string \| null` |  |
| `title` | `string \| null` | The member's group, shown under their name. The same rule the postbit follows: `users.display_group_id` where the member has chosen one, and their primary group otherwise. `null` only where the group behind it has gone. |
| `groups` | `readonly GroupTagModel[] \| undefined` | optional — Every group shown with this member's name, on the same terms as `PostAuthorModel.groups`: display group first, the rest in display order, capped by the board's *Maximum displayed groups* setting. Render it instead of `title` when it is non-empty; fall back to `title` otherwise. |
| `joinedAt` | `TimeModel` |  |
| `lastVisitAt` | `TimeModel \| null` |  |
| `postCount` | `CountModel` |  |
| `signatureHtml` | `string \| null` |  |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | Custom profile fields, already filtered by visibility. |
| `actions` | `readonly LinkModel[]` |  |
| `regions` | `{ /** The `profile.panel` region. */ readonly plugins?: ReactNode }` | optional |

### SearchForm

`server` · stable

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
| `advanced` | `SearchAdvancedModel` | optional — The rest of the form: who posted it, when, where to look, and what a result is. Optional, and a theme that ignores it still submits a working search — every control in here is a narrowing the app defaults for a form that leaves it out. |

### SearchResults

`server` · stable

The results page for one search: what matched, an excerpt of each hit, and the form that narrows the set. Separate from SearchForm because a result list is a listing and shares nothing with a filter panel but the word "search".

Props: `SearchResultsModel`

| Field | Type | Notes |
|---|---|---|
| `terms` | `string` | What was searched for, as the reader typed it. |
| `searchedAt` | `TimeModel` |  |
| `hits` | `readonly SearchHitModel[]` |  |
| `nextHref` | `string \| null` | The next page of this same search, or `null` at the end. Superseded by `regions.pagination`, which walks backwards as well and says which page this is. Both are populated: a theme written before the region existed keeps working, and one that renders the region should not also render this link or the page carries two pagers. |
| `nextLabel` | `string` |  |
| `newSearchHref` | `string` | Back to an empty form. Always offered: a search that found nothing needs it most. |
| `within` | `{ readonly action: string readonly field: string readonly value: string readonly label: string readonly hint: string readonly submitLabel: string readonly hidden?: readonly HiddenFieldModel[] }` | The narrow-this-search form. A GET form, like `SearchForm` and for the same reason — the narrowed search is a URL of its own, not a state this page holds. `hidden` carries the advanced options this search was run with, one input per entry, so that narrowing it keeps them; a theme that drops them narrows within the words alone. |
| `refine` | `SearchRefineModel` | optional — Filtering and sorting for the set on screen. Optional: a theme that ignores it shows the results as the search asked for them. |
| `regions` | `{ /** The `Pagination` for this result set, rendered by the page. */ readonly pagination?: ReactNode }` | optional |

### DiscoveryView

`server` · stable

The body of a discovery listing — new posts, today, unanswered, and a member’s own threads and replies. One slot for all of them: they differ in what the query selected, never in what a reader is looking at.

Props: `DiscoveryViewModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `blurb` | `string` | One line saying what this view selected, e.g. "Threads nobody has replied to yet". |
| `tabsLabel` | `string` |  |
| `tabs` | `readonly TabModel[]` |  |
| `rows` | `readonly DiscoveryRowModel[]` |  |
| `nextHref` | `string \| null` |  |
| `nextLabel` | `string` |  |
| `emptyMessage` | `string` | What to say when `rows` is empty — different at the end of a paged list ("you have reached the end") from at the start of one ("nothing here yet"). |
| `refusal` | `{ readonly message: string readonly signInHref: string readonly signInLabel: string } \| null` | Set when the view refused rather than failed: a guest asking for their own threads. The listing is empty and this says why, with `signInHref` to fix it. Not an error — a themed page, not the error page. |

### PanelShell

`server` · stable

The frame around a control panel: the navigation rail, the links to the other panels a viewer may reach, and the page beside them. Rendered for the member, moderator and admin panels alike — `panel` says which.

Props: `PanelShellModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind` |  |
| `links` | `readonly LinkModel[]` | The other panels this viewer may reach, resolved and already filtered by permission. Never contains the panel being rendered. |
| `linksLabel` | `string` |  |
| `regions` | `{ /** The `PanelNav` for this panel. */ readonly nav: ReactNode }` |  |
| `children` | `ReactNode` | optional |

### PanelNav

`server` · stable

A control panel’s section navigation. Server, not client: which section is open is resolved from the request path before rendering, so the rail arrives correct rather than after hydration, and a panel needs no JavaScript to know where it is.

Props: `PanelNavModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind` |  |
| `label` | `string` | Accessible name for the navigation landmark. |
| `sections` | `readonly PanelNavSectionModel[]` |  |
| `currentTitle` | `string \| null` | The title of the deepest item the reader is under, for a collapsed rail's summary — "Sections · Attachments" says where a tap would leave from. `null` when nothing matched the path. |

### PanelPage

`server` · stable

One control-panel page: its heading, the line under it, the controls beside it, and the body. Also the frame for the account, moderation and messaging pages that are panel-shaped without being in a panel.

Props: `PanelPageModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind \| null` |  |
| `title` | `string` |  |
| `back` | `LinkModel \| null` | Where this page was reached from, when it is a page under another. |
| `frame` | `'panel' \| 'standalone'` | optional — `panel` when a `PanelShell` is already around this page — it has centred the column and set the gutters, and the page fills what the rail leaves. `standalone` when nothing wraps the page and it has to find its own middle: who's online, the board statistics, the report form. Absent reads as `panel`, which is what a theme that ignores this renders today. |
| `width` | `'reading' \| 'wide'` | `reading` for prose and forms, `wide` for a table nobody can read at reading width. The theme decides what each measures. |
| `gap` | `'normal' \| 'loose'` | `loose` for a page built of `PanelSection`s, `normal` for a page that is one thing. The theme decides what each measures; the distinction is whether the body has internal headings that need air around them. |
| `regions` | `{ /** A sentence under the heading saying what this page is for. */ readonly lede?: ReactNode /** Smaller detail under the lede — counts, timestamps, scope. */ readonly meta?: ReactNode /** Controls that act on the whole page, beside the heading. */ readonly actions?: ReactNode }` |  |
| `children` | `ReactNode` | optional |

### PanelSection

`server` · stable

A labelled section inside a panel page. Rendered by the page among its content rather than around it, which is why it is not part of PanelPage.

Props: `PanelSectionModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `headingId` | `string` | The id the heading takes, so the section's landmark can point at it. Given by the page because the page is where the section is named twice — once as a heading and once as the region's accessible name. |
| `regions` | `{ readonly description?: ReactNode readonly actions?: ReactNode }` |  |
| `children` | `ReactNode` | optional |

### AuthPage

`server` · stable

Signing in, registering, resetting a password, asking for a new confirmation link. One slot for all of them: the same card with a different form in it, and the form itself is an app-rendered region because every one of them posts to a Server Action.

Props: `AuthPageModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `alert` | `string \| null` | `null` unless something about the way in went wrong. |
| `links` | `readonly AuthLinkModel[]` |  |
| `regions` | `{ /** A sentence under the heading. */ readonly lede?: ReactNode /** The form itself, or nothing on a page that only explains something. */ readonly form?: ReactNode /** Standing advice beside the form — where to look before asking again. */ readonly note?: ReactNode }` |  |

### ForumJump

`server` · stable

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

`server` · stable

The MyBB-style interstitial: "your post was made, continuing in a moment", with a real link for anyone the meta refresh does not carry.

Props: `RedirectNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `message` | `string` |  |
| `targetHref` | `string` |  |
| `delaySeconds` | `number` |  |

### ErrorNotice

`server` · stable

The themed body of an error or not-found page. Must not depend on the database: it is what renders when the database is the thing that failed.

Props: `ErrorNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `status` | `number` |  |
| `title` | `string` |  |
| `message` | `string` |  |
| `homeHref` | `string` |  |
| `requestId` | `string \| null` | The request id, so a user can quote it in a report. |

## Shared models

Referenced by the models above. Same promise: a field of a shared model reached
from a stable slot is stable.

### AuthLinkModel

A link out of an authentication page, with the sentence that introduces it. "New here? **Create an account**" is one thought and two pieces of markup. `lead` carries the first half so the copy stays the app's and the layout stays the theme's — a theme that renders links as a plain list can drop it, and one that renders them as sentences has the sentence.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` | from `LinkModel` |
| `href` | `string` | from `LinkModel` |
| `group` | `string` | from `LinkModel` — optional — Which run of links this one belongs to, for themes that separate them. Compare it for *change*, never for value: a theme draws a rule wherever consecutive links disagree, and the strings themselves stay the app's business. Absent everywhere is the normal case and renders as one run. |
| `newTab` | `boolean` | from `LinkModel` — optional — Whether the link leaves the board, and should open in its own tab (0.16). Set by the app for a link an administrator marked as off-site — a chat server, a shop, a wiki. A theme that ignores it renders an ordinary link and is still correct, which is what keeps the field additive. A theme that honours it must pair `target="_blank"` with `rel="noopener noreferrer"`, because the opened page can otherwise reach back through `window.opener`. |
| `submenu` | `readonly LinkModel[]` | from `LinkModel` — optional — Links that belong under this one, for a menu that opens a level (0.16). One level only: the app never nests a submenu inside a submenu, so a theme that renders one level renders every menu there is. Absent is the normal case. A theme that ignores it drops those links from the page entirely rather than flattening them, so a theme meaning to support the board navigation should render them — under `:hover` and `:focus-within`, both, because a menu that only opens to a mouse is closed to a keyboard. |
| `lead` | `string \| null` |  |

### CountModel

A counter, in both forms a template needs. See this file's header.

| Field | Type | Notes |
|---|---|---|
| `value` | `number` | The number itself: compare, pluralise and branch on it. Never rendered raw. |
| `label` | `string` | Preformatted in the viewer's language, e.g. "1,204" or "1.204". |

### DiscoveryRowModel

One row in a discovery listing.

| Field | Type | Notes |
|---|---|---|
| `threadId` | `number` |  |
| `title` | `string` |  |
| `href` | `string` |  |
| `forum` | `LinkModel` |  |
| `authorUsername` | `string` |  |
| `replyCount` | `CountModel` |  |
| `lastPostAt` | `TimeModel` |  |
| `lastPostUsername` | `string \| null` | `null` when the thread has no reply yet, so the last post is the first. |

### EditorToolbarButtonModel

One control in an `EditorToolbar`.

| Field | Type | Notes |
|---|---|---|
| `tag` | `EditorTag` | Which edit to run — `applyEditorTag(field, tag, placeholder)` from `@meith/theme-kit`. |
| `label` | `string` |  |
| `title` | `string` | `label`, plus the keyboard shortcut when this tag has one, already formatted. |
| `keyShortcut` | `string \| null` | `aria-keyshortcuts`, e.g. `"Control+b"`, or `null` for a tag with no shortcut. |
| `icon` | `string \| null` | A themed icon's name, for a theme that draws one — see `PanelNavIcon` for the same idea. Always `null` today: nothing in the default palette names one yet, so every theme renders its own glyph from `tag` or `label`. The field stays in the contract for the theme that wants to key off it once one does. |
| `placeholder` | `string \| null` | Fills a wrap or spoiler tag when nothing is selected; `null` for a tag that does not need one. |

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
| `threadCount` | `CountModel` |  |
| `postCount` | `CountModel` |  |
| `lastPost` | `LastPostModel \| null` |  |
| `isUnread` | `boolean` | `false` for a guest, who has no read state. |
| `subforums` | `readonly LinkModel[]` |  |

### GroupTagModel

One of the groups shown with a member's name. `nameClass` works exactly like `UserRefModel.nameClass` and exists for the same reason: the group's colour differs between light and dark, so it arrives as a class the app's `<head>` stylesheet defines rather than as a colour. Put it on whatever renders the title; a theme that ignores it shows the title in its ordinary text colour and is still correct.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `nameClass` | `string \| null \| undefined` | optional |

### HiddenFieldModel

A form value carried across a submit without being shown.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` |  |
| `value` | `string` |  |

### LastPostModel

The last post in a forum or thread, as a listing shows it.

| Field | Type | Notes |
|---|---|---|
| `threadTitle` | `string` |  |
| `href` | `string` | Deep link to the post itself, not the thread's first page. |
| `author` | `UserRefModel` |  |
| `at` | `TimeModel` |  |

### LatestPostModel

One post in the index's "latest posts" panel.

| Field | Type | Notes |
|---|---|---|
| `threadTitle` | `string` | The thread it is in. A post has no title of its own. |
| `href` | `string` | `/thread/12-slug?post=34` — the post, not the top of its thread. |
| `forum` | `LinkModel` |  |
| `author` | `UserRefModel` |  |
| `excerpt` | `string` | The post as text: flattened out of its Markdown source and cut on a word boundary, the same way a feed entry's summary is. Flattened rather than rendered, because the board's HTML carries quotes, directives and attachment markup whose meaning is lost in two lines — and because a theme dropping raw post HTML into a sidebar is one plugin away from being an injection point. |
| `postedAt` | `TimeModel` |  |

### LatestThreadModel

One thread in the index's "latest threads" panel. Every row carries its forum, because these two panels are the only lists on the board that cross it: without the forum, two identically-titled threads in two forums are the same row printed twice.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `href` | `string` |  |
| `forum` | `LinkModel` | The forum it was started in, resolved — a theme never builds an href. |
| `author` | `UserRefModel` |  |
| `replyCount` | `CountModel` |  |
| `startedAt` | `TimeModel` |  |

### LinkModel

A resolved link. Themes never build hrefs; the app owns URL shape.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `href` | `string` |  |
| `group` | `string` | optional — Which run of links this one belongs to, for themes that separate them. Compare it for *change*, never for value: a theme draws a rule wherever consecutive links disagree, and the strings themselves stay the app's business. Absent everywhere is the normal case and renders as one run. |
| `newTab` | `boolean` | optional — Whether the link leaves the board, and should open in its own tab (0.16). Set by the app for a link an administrator marked as off-site — a chat server, a shop, a wiki. A theme that ignores it renders an ordinary link and is still correct, which is what keeps the field additive. A theme that honours it must pair `target="_blank"` with `rel="noopener noreferrer"`, because the opened page can otherwise reach back through `window.opener`. |
| `submenu` | `readonly LinkModel[]` | optional — Links that belong under this one, for a menu that opens a level (0.16). One level only: the app never nests a submenu inside a submenu, so a theme that renders one level renders every menu there is. Absent is the normal case. A theme that ignores it drops those links from the page entirely rather than flattening them, so a theme meaning to support the board navigation should render them — under `:hover` and `:focus-within`, both, because a menu that only opens to a mouse is closed to a keyboard. |

### LogoModel

A board's logo, already resolved for this reader's colour scheme. Optional, and absent on most boards: a board with no logo renders its name in text, which is what every board did before this field existed. **The app resolves the scheme, not the theme.** A theme cannot do it, and the obvious attempt is wrong in the commonest case: `dark:hidden` matches the `.dark` class, and a reader who has chosen "system" has no class — their dark mode comes from a media query. They would get the light logo on a black page, which is the exact failure two images exist to prevent. The server knows the answer, so it gives one.

| Field | Type | Notes |
|---|---|---|
| `src` | `string` | The image to render. Already the right one for a forced colour scheme. |
| `darkSrc` | `string \| null` | A dark-scheme source, or `null`. Non-null means "wrap it in a `<picture>` and put this behind `(prefers-color-scheme: dark)`" — the reader is on "system" and has two images to choose between. Null covers three different situations a theme does not need to tell apart: one image, or a reader who has forced a scheme, in which case `src` is already the right one. |
| `alt` | `string` | Never empty — the board's name when the operator has set nothing. |

### OnlineMemberModel

One visitor in the online list. `location` is **already resolved against the reader**: a forum they may not see arrives as the bare label, never as a title with a link. The theme renders what it is given and cannot leak what it was not.

| Field | Type | Notes |
|---|---|---|
| `userId` | `number \| null` | from `UserRefModel` — `null` when the account was deleted; `username` is still shown. |
| `username` | `string` | from `UserRefModel` |
| `profileHref` | `string \| null` | from `UserRefModel` |
| `nameClass` | `string \| null \| undefined` | from `UserRefModel` — optional — A class carrying this member's group colour, or `null` for most members. **A theme should put this on whatever renders the name**, wherever a name appears. It is a class rather than a colour because the value has to differ between light and dark, and a `style` attribute cannot hold two answers — a reader on "system" has no `.dark` class at all, so the only place both can live is the stylesheet the app emits into `<head>`. A theme that ignores it renders the name in the ordinary text colour and is still correct, which is what makes the field additive. It will simply not show the board's own hierarchy, which most boards will notice. |
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

### PanelNavItemModel

| Field | Type | Notes |
|---|---|---|
| `href` | `string` |  |
| `title` | `string` |  |
| `icon` | `PanelNavIcon \| null` | What this item is about, for a themed icon. `null` on a child item. |
| `count` | `number \| null` | A waiting count — the approval queue, unread messages — or `null`. |
| `current` | `PanelNavCurrent \| null` | `null` when the reader is somewhere else entirely. |
| `isRecord` | `boolean` | A page reached from elsewhere rather than from the rail — warning a member, editing one forum. It is shown as where you are and it is not a link, because a link to the page you are on that also needs an argument you no longer have is a dead end. Only ever present while the reader is on it. |

### PanelNavSectionModel

| Field | Type | Notes |
|---|---|---|
| `href` | `string` | from `PanelNavItemModel` |
| `title` | `string` | from `PanelNavItemModel` |
| `icon` | `PanelNavIcon \| null` | from `PanelNavItemModel` — What this item is about, for a themed icon. `null` on a child item. |
| `count` | `number \| null` | from `PanelNavItemModel` — A waiting count — the approval queue, unread messages — or `null`. |
| `current` | `PanelNavCurrent \| null` | from `PanelNavItemModel` — `null` when the reader is somewhere else entirely. |
| `isRecord` | `boolean` | from `PanelNavItemModel` — A page reached from elsewhere rather than from the rail — warning a member, editing one forum. It is shown as where you are and it is not a link, because a link to the page you are on that also needs an argument you no longer have is a dead end. Only ever present while the reader is on it. |
| `children` | `readonly PanelNavItemModel[]` | Already filtered to what belongs on screen: a section's children are listed while it `isOpen`, and a record child only while it is the page. |
| `isOpen` | `boolean` | The reader is on this section or inside it. |
| `isOverview` | `boolean` | The panel's front page, which sits above the sections rather than among them. Exactly one section carries this. |

### PostActionsModel

| Field | Type | Notes |
|---|---|---|
| `quoteHref` | `string \| null` |  |
| `editHref` | `string \| null` |  |
| `restoreHref` | `string \| null` | Where a soft-deleted post is put back. A separate field rather than a second meaning for `editHref`, because the two are never both offered: a deleted post cannot be edited, and a visible one has nothing to restore. A theme that renders both gets exactly one. |
| `historyHref` | `string \| null` | optional |
| `reportHref` | `string \| null` |  |
| `warnHref` | `string \| null` | Warn this post's author, citing this post. Present for moderators only, and `null` for a post whose author is the viewer or a deleted account. Separate from `moderateHref` because a warning is aimed at the *person* and the post is only the evidence ��� which is also why the link carries the post id rather than living on the post's own moderation controls. |
| `moderateHref` | `string \| null` | Reserved for per-post moderation controls that are not inline. Still `null` everywhere: per-post moderation is on checkboxes and a bar rather than a per-post link, so nothing fills this yet. It stays in the contract because the moderation control panel is where such a *page* would live, and removing a public field to add it back next feature is worse than a documented `null`. |
| `rateHref` | `string \| null` | Rate this post's author, for this post. Null on your own post, on a board with reputation off, and for anybody without the permission. It carries the post so the rating is attached to *this* post rather than to the author generally — which is what makes one rating per post a meaningful rule. |

### PostAttachmentModel

One file attached to a post.

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
| `nameClass` | `string \| null \| undefined` | from `UserRefModel` — optional — A class carrying this member's group colour, or `null` for most members. **A theme should put this on whatever renders the name**, wherever a name appears. It is a class rather than a colour because the value has to differ between light and dark, and a `style` attribute cannot hold two answers — a reader on "system" has no `.dark` class at all, so the only place both can live is the stylesheet the app emits into `<head>`. A theme that ignores it renders the name in the ordinary text colour and is still correct, which is what makes the field additive. It will simply not show the board's own hierarchy, which most boards will notice. |
| `avatarUrl` | `string \| null` |  |
| `title` | `string \| null` | The display group's title, or a custom user title. Was `null` on every post the board has ever rendered — the field was in the contract from the start and nothing populated it, so every theme's postbit had a place for a member's standing and nothing to put in it. It comes from `users.display_group_id`, falling back to the primary group. |
| `groups` | `readonly GroupTagModel[] \| undefined` | optional — Every group shown with this member's name — the display group first, then the rest of the groups they hold in display order, cut off at the board's *Maximum displayed groups* setting. `title` is always the first entry's title, so a theme written before this field existed keeps showing the display group and is still correct; a theme that renders this list should render it *instead of* `title`, not as well. Empty where the board resolved no groups at all — fall back to `title` there, which is also what carries a custom user title. |
| `badge` | `LogoModel \| null \| undefined` | optional — The board's badge for this member's group, or `null`. Shaped exactly like `LogoModel` and for the same reason: the app has already chosen which of the two images this reader gets, so `darkSrc` is non-null only for a reader on "system", where the server cannot know. |
| `reputation` | `CountModel \| null \| undefined` | optional — This member's reputation, or `null` when the board has it switched off. A denormalised counter on `users`, so it costs the postbit nothing. |
| `postCount` | `CountModel` |  |
| `joinedAt` | `TimeModel \| null` |  |
| `signatureHtml` | `string \| null` | Pre-rendered Markdown. Trusted output of the board's own renderer. |
| `isOnline` | `boolean` | Whether this author has been active inside the online window. Already resolved against the reader, the same way the who's-online list is: an author browsing invisibly reads as offline for everyone without `modcp.access`, so a theme renders this flag as given and cannot light up a dot the board means to keep dark. |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | Custom profile fields, for the ones an operator marked for the postbit and this viewer may see. The same `{label, value}` shape `MemberProfileModel.fields` uses, and **plain text** for the same reason: it is rendered as text by the theme, and a field that could carry markup is stored XSS on the board's heaviest page. Empty on a board with no custom fields, which is most of them. |

### PostBitModel

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `number` | `number` | Position within the thread, 1-based. What "#12" in the corner means. |
| `permalink` | `string` | `/thread/12-slug#post-3` — anchored by `number`, so the link says what the corner says. |
| `author` | `PostAuthorModel` |  |
| `bodyHtml` | `string` | Pre-rendered Markdown. |
| `quoteSource` | `string` | @deprecated Since theme API 1.4, removed in 2.0. Use `post.id`. It existed so the client could assemble a quote out of the page. Quoting asks the server for a post **by id** now, which re-checks who may see it and cannot hand back what a deleted post used to say — so this is a copy of every post's source in the HTML of every thread page, for nobody. Still populated, because a theme could have read it; see `DEPRECATIONS`. |
| `postedAt` | `TimeModel` |  |
| `editedNote` | `string \| null` | "Last edited by X on Y", already assembled, or `null`. |
| `isFirstPost` | `boolean` |  |
| `visibility` | `'visible' \| 'unapproved' \| 'deleted'` | A moderator sees deleted and unapproved posts, marked as such. |
| `ignored` | `{ readonly authorUsername: string /** Same page, this post revealed. A GET: revealing changes nothing. */ readonly revealHref: string } \| null` | Set when this viewer ignores the author and has not revealed this post; `null` otherwise, which is the case on almost every post. The body is **withheld server-side** when this is set — `bodyHtml` is empty, the signature and custom fields are gone — rather than hidden with CSS, because "ignored" that ships the text to the browser is a preference rather than a feature. The post keeps its place and its number: filtering it out would give every viewer a different page size and make "#12" mean different posts to different people. A theme renders the placeholder and the link. Both are required — a hidden post with no way to see it is a hole in a conversation. |
| `attachments` | `readonly PostAttachmentModel[]` | The files attached to this post. Empty on almost every post, and empty rather than absent so a theme has one shape to render. **Every entry is already downloadable**: a `pending` upload — one whose re-encode has not finished — and a failed one are not in this list, because a link to a file that is not there yet is worse than the file appearing a minute later. `thumbnailHref` is `null` for anything that is not an image, and for an image small enough that a thumbnail would be the same picture again. A theme showing an image inline uses `thumbnailHref ?? href` and gets the right answer in both cases. |
| `actions` | `PostActionsModel` |  |

### PrefixModel

A thread prefix; `token` supplies its styling.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `token` | `string \| null` |  |

### SearchAdvancedModel

The advanced half of the search form. `isOpen` is the app saying whether the reader has anything in here — a returning search with an author or a date window set opens the panel so the narrowing that produced the results is visible rather than hidden behind a closed disclosure. A theme is free to render the panel open always; it must not render it *closed* when `isOpen` is true.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `isOpen` | `boolean` |  |
| `author` | `SearchTextFieldModel` |  |
| `toggles` | `readonly SearchToggleModel[]` |  |
| `choices` | `readonly SearchChoiceModel[]` |  |

### SearchChipModel

A filter that is on, and the href that turns it off.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `removeHref` | `string` |  |

### SearchChoiceModel

One `<select>` in a search form or a results filter: the name to submit it under, a label, and the options with the current one marked. A theme renders these as it is handed them and in the order it is handed them. Which axes a search has is the app's decision, not a theme's, and a theme that enumerated them would lose one the day the app gained it.

| Field | Type | Notes |
|---|---|---|
| `field` | `string` |  |
| `label` | `string` |  |
| `options` | `readonly OptionModel[]` |  |

### SearchHitModel

One search result: where it goes, and enough of it to decide whether to go. `excerptHtml` is the only HTML in this model, and it is the app's own: the search engine returns the matching fragment with the matched words wrapped in `<b>`, and nothing else survives — the post's own markup is stripped before the excerpt is cut, so a theme is styling emphasis, not rendering a post.

| Field | Type | Notes |
|---|---|---|
| `postId` | `number` |  |
| `threadTitle` | `string` |  |
| `href` | `string` | Resolved to the post inside its thread, page and anchor included. |
| `excerptHtml` | `string` |  |
| `authorUsername` | `string` |  |
| `postedAt` | `TimeModel` |  |

### SearchRefineModel

Filtering and sorting for a results page, in the order of how often it is used: the count, the order, what is already narrowing the page, and — folded away until wanted — the filters themselves. ## Why the order is links and the filters are a form Changing the order is one decision and the commonest one, so `sorts` are links: one click, nothing to submit, and each href carries the filters already applied. Filtering is several decisions at once — a forum *and* a date, say — so `choices` are a GET form with one submit, and the result is a URL. `applied` is the reverse of both: one chip per filter that is on, each with an href that removes only itself. A reader with JavaScript off gets all three, because all three are ordinary HTML. ## The space this is allowed to take A results page is a listing, and a filter panel that fills the screen above it is a listing you cannot see. This is a strip, not a panel: labels sit beside their controls rather than above them, and the whole thing is meant to read as one bar between the heading and the results. Hiding it behind a disclosure is the other way to save the space and a worse one — a filter nobody can see is a filter nobody uses, and a reader who cannot see how a page was narrowed does not trust it. ## Counts, and what they count An option's label carries the number of results it would leave, counted against the search *without* the forum and author filters applied — so the counts stay put as a reader moves between forums instead of collapsing to the one they are already in. `note` carries the caveat when the board is big enough that the count is a floor rather than a total.

| Field | Type | Notes |
|---|---|---|
| `action` | `string` | Where the filters submit: this same results page. |
| `label` | `string` |  |
| `summary` | `string` | One line: how many matched, and what is being shown. |
| `note` | `string \| null` | The bound on the count, when there is one. `null` when the count is exact. |
| `sorts` | `readonly TabModel[]` | The order, as links. One is always current. |
| `sortsLabel` | `string` | Names the run of order links, for a theme that labels it. |
| `choices` | `readonly SearchChoiceModel[]` |  |
| `submitLabel` | `string` |  |
| `applied` | `readonly SearchChipModel[]` |  |
| `clearHref` | `string \| null` | Drops every filter and keeps the order, or `null` when none is on. |

### SearchTextFieldModel

A free-text control: a name to submit under, and what is in it now.

| Field | Type | Notes |
|---|---|---|
| `field` | `string` |  |
| `label` | `string` |  |
| `value` | `string` |  |
| `placeholder` | `string` |  |
| `hint` | `string` |  |

### SearchToggleModel

A checkbox: on when `isOn`, submitted as `value` under `field`.

| Field | Type | Notes |
|---|---|---|
| `field` | `string` |  |
| `value` | `string` |  |
| `label` | `string` |  |
| `isOn` | `boolean` |  |

### SelectionModel

One inline-moderation checkbox, or `null` when this viewer has no business selecting rows. Plain data, and it has to be: the *form* it belongs to carries a Server Action reference, and such references never cross the theme contract. So the app renders the form — below the listing, where a bar of buttons belongs — and the theme renders a checkbox that says which form it belongs to. `formId` is the whole trick, and it is why this works with scripting off. HTML's `form` attribute associates a control with a form **by id, anywhere in the document**, so the checkboxes can live inside table rows, list items or article elements without the listing having to be wrapped in a `<form>` — which it cannot be, because `ForumDisplay` already renders a mark-read form and nested forms are not a thing browsers will parse.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The field name every checkbox shares. |
| `value` | `string` | This row's value, opaque to the theme. |
| `formId` | `string` | The `id` of the app-rendered form these checkboxes submit with. |
| `label` | `string` | For a visually-hidden label: "Select 'How do I …' for moderation". |

### TabModel

One tab in a strip of view tabs.

| Field | Type | Notes |
|---|---|---|
| `href` | `string` |  |
| `label` | `string` |  |
| `isCurrent` | `boolean` |  |

### ThreadRowModel

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `title` | `string` |  |
| `href` | `string` |  |
| `prefix` | `PrefixModel \| null` |  |
| `author` | `UserRefModel` |  |
| `replyCount` | `CountModel` |  |
| `viewCount` | `CountModel` |  |
| `isSticky` | `boolean` |  |
| `isLocked` | `boolean` |  |
| `isUnread` | `boolean` |  |
| `isMoved` | `boolean` | Set when the thread is a move stub; the row renders as a redirect. |
| `visibility` | `'visible' \| 'unapproved' \| 'deleted'` | optional — Whether this thread is hidden from ordinary members. `'visible'` on almost every row; a listing only ever carries `'unapproved'` or `'deleted'` for a viewer allowed to see held or removed threads, so a theme that marks them — a badge, a tint — is drawing something only staff will meet. Optional: a theme written before this field treats every row as visible, which is what the reader saw anyway. |
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
| `nameClass` | `string \| null \| undefined` | optional — A class carrying this member's group colour, or `null` for most members. **A theme should put this on whatever renders the name**, wherever a name appears. It is a class rather than a colour because the value has to differ between light and dark, and a `style` attribute cannot hold two answers — a reader on "system" has no `.dark` class at all, so the only place both can live is the stylesheet the app emits into `<head>`. A theme that ignores it renders the name in the ordinary text colour and is still correct, which is what makes the field additive. It will simply not show the board's own hierarchy, which most boards will notice. |

### ViewerModel

Who is looking. The only actor data a theme is given.

| Field | Type | Notes |
|---|---|---|
| `isGuest` | `boolean` |  |
| `userId` | `number \| null` | `null` for a guest. |
| `username` | `string \| null` |  |
| `profileHref` | `string \| null` |  |
| `avatarUrl` | `string \| null` |  |
| `canAccessAdminCp` | `boolean` | Whether to render the admin-panel link. A *rendering* hint, resolved by the Authorizer already — a theme must never conclude anything about permissions on its own, and themes stay out of authorization entirely. |
| `canAccessModCp` | `boolean` | Whether to render the moderation link. Same shape and same rule as `canAccessAdminCp`: a rendering hint the Authorizer has already decided. Group-level only, which is a real limitation rather than an oversight: a per-forum appointee's queue exists and is reachable, but answering "does this person moderate anything" for them costs the tree, and the shell renders on every page. The moderation control panel is where that link earns its query. |

## Scheduled removals

Nothing is deprecated in v0.22. Nothing can be: this is the first
frozen contract, so there is no earlier promise to withdraw.
