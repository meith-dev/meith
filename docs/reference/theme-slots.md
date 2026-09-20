# Theme slots and view models

<!--
  GENERATED FILE — do not edit.

  Written by scripts/theme-api-docs.mjs from packages/theme-kit/src/{slots,api,
  view-models}.ts. Run `pnpm theme:docs` after changing any of them; `pnpm verify`
  and CI run `pnpm theme:docs:check` and fail when this file and the code disagree.
-->

**theme-kit v0.24.** 36 slots: 36 stable, 0 provisional, 0 deprecated.

Stable contracts retain existing fields until a major release. Provisional models may change in a minor. Deprecated contracts remain available until their scheduled removal.

See [Theme contract](../extensions/theme-contract.md) for implementation and versioning rules.

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

Page frame with skip link, header, main landmark and footer, including error pages.

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
| `logo` | `LogoModel \| undefined` | optional — Optional board logo. Use the supplied alternative text and dimensions; fall back to the board name when absent. |
| `children` | `ReactNode` | optional |

### UserPanel

`server` · stable

Actor-specific greeting and account links, or guest sign-in prompt. Do not cache globally.

Props: `UserPanelModel`

| Field | Type | Notes |
|---|---|---|
| `viewer` | `ViewerModel` |  |
| `links` | `readonly LinkModel[]` | Sign-in / register, or account links. Resolved by the app. |
| `unreadNotifications` | `CountModel` | `value` is `0` when there is nothing to show. |
| `unreadMessages` | `CountModel` |  |
| `notificationsHref` | `string` | optional — Destinations for the unread notification and message counts. Use the resolved hrefs. |
| `messagesHref` | `string` | optional |
| `regions` | `{ readonly notifications?: ReactNode }` | optional |
| `children` | `ReactNode` | optional — App-rendered account controls, including the POST logout form. Place the supplied form; do not replace logout with a GET link. |

**`regions.notifications`**

App-rendered notification menu with messages and permitted moderation content, including a no-JavaScript fallback. Render instead of separate unread-count controls when present. Optional since 0.16.

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
| `poweredBy` | `LinkModel` | optional — Optional software attribution link supplied by the app. Added in 0.8. |
| `regions` | `{ readonly controls?: ReactNode }` | optional — Optional app-rendered forum-jump and appearance controls. Place both in the footer. Added in 0.20. |

### Notice

`server` · stable

Server-rendered flash message or board notice.

Props: `NoticeModel`

| Field | Type | Notes |
|---|---|---|
| `kind` | `'info' \| 'success' \| 'warning' \| 'error'` |  |
| `message` | `string` |  |
| `dismissHref` | `string \| null` |  |

### Announcement

`server` · stable

Dated, authored announcement shown above forums until expiry.

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
| `regions` | `{ readonly categories: ReactNode; readonly stats: ReactNode; readonly online: ReactNode; readonly latest?: ReactNode; readonly plugins?: ReactNode; readonly announcements?: ReactNode }` |  |

**`regions.categories`**

One `CategoryBlock` per top-level category, already rendered.

**`regions.latest`**

App-rendered newest-thread/post region, refreshed together in one request. Place it as a unit. Absent when unavailable.

**`regions.plugins`**

Optional, pre-rendered index.footer plugin contributions in host order.

**`regions.announcements`**

Optional, pre-rendered live announcements. Absent when there are none.

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
| `computedAt` | `TimeModel \| null` | Last counter-rollup time, or null before the first run. Display it to identify the age of the totals. |

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

Newest threads, rendered on the server and refreshed through the app’s shared live region.

Props: `LatestThreadsModel`

| Field | Type | Notes |
|---|---|---|
| `threads` | `readonly LatestThreadModel[]` |  |
| `capturedAt` | `TimeModel` |  |

### LatestPosts

`server` · stable

Newest posts and excerpts, refreshed with LatestThreads.

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
| `regions` | `{ readonly tools?: ReactNode; readonly subforums: ReactNode; readonly threads: ReactNode; readonly pagination: ReactNode; readonly announcements?: ReactNode; readonly afterContent?: ReactNode }` |  |

**`regions.tools`**

App-rendered forum ordering controls. Place below the heading and above the listing. Subscription controls are in `afterContent`.

**`regions.threads`**

One `ThreadRow` per thread. Empty-state markup is the theme's.

**`regions.announcements`**

This forum's announcements *and* the board's — an announcement being board-wide would mean little if it appeared only on the index, which is the page fewest people arrive on.

**`regions.afterContent`**

App-rendered forum subscription controls. Place after the listing.

### ThreadRow

`server` · stable

One thread in a listing: prefix, title, author, counters, last post.

Props: `ThreadRowSlotModel`

| Field | Type | Notes |
|---|---|---|
| `thread` | `ThreadRowModel` |  |
| `select` | `SelectionModel \| null` | The inline-moderation checkbox, or `null`. |
| `regions` | `{ readonly pluginBadges?: ReactNode }` | optional |

**`regions.pluginBadges`**

Optional thread-row plugin badges, supplied by one batched call per page. Place beside the thread flags. Added in 0.22.

### SubforumList

`server` · stable

The compact list of child forums shown above a thread list.

Props: `SubforumListModel`

| Field | Type | Notes |
|---|---|---|
| `forums` | `readonly ForumRowModel[]` |  |

### Pagination

`server` · stable

Resolved page links that work without JavaScript.

Props: `PaginationModel`

| Field | Type | Notes |
|---|---|---|
| `page` | `number` |  |
| `pageCount` | `number` |  |
| `pageCountIsExact` | `boolean` | True when `pageCount` is an exact total. Otherwise it is a lower bound: display the current page without “of N”. |
| `pages` | `readonly { readonly page: number; readonly href: string; readonly isCurrent: boolean }[]` |  |
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
| `watch` | `ThreadWatchModel \| null` | optional — Optional watch toggle. Null for guests or without the subscription service. |
| `regions` | `{ readonly tools?: ReactNode; readonly posts: ReactNode; readonly pagination: ReactNode; readonly afterContent?: ReactNode; readonly quickReply: ReactNode }` |  |

**`regions.tools`**

App-rendered moderator tools and poll. Place below the title and above posts. Rating and subscription controls are in `afterContent`.

**`regions.posts`**

One `PostBit` per post on this page.

**`regions.afterContent`**

App-rendered rating and subscription controls. Place after posts and before quick reply.

**`regions.quickReply`**

The quick-reply island, or `null` when the viewer may not reply — in which case nothing is rendered and no island bytes are shipped.

### PostBit

`server` · stable

Post author, body and footer, rendered on the server.

Props: `PostBitSlotModel`

| Field | Type | Notes |
|---|---|---|
| `post` | `PostBitModel` |  |
| `select` | `SelectionModel \| null` | The inline-moderation checkbox, or `null`. A theme that ignores it loses only bulk actions. |
| `regions` | `{ readonly actions: ReactNode; readonly pluginBadges?: ReactNode; readonly pluginFooter?: ReactNode }` |  |

**`regions.actions`**

The `PostActions` slot, rendered by the page.

**`regions.pluginBadges`**

The `postbit.badges` region, beside the author's name.

**`regions.pluginFooter`**

The `postbit.footer` region, below the body.

### PostActions

`server` · stable

Per-post controls (quote, edit, report, moderate). Links and forms, not buttons with handlers, so they work without JavaScript.

Props: `PostActionsSlotModel`

| Field | Type | Notes |
|---|---|---|
| `actions` | `PostActionsModel` |  |
| `postId` | `number` |  |
| `children` | `ReactNode` | optional — App-rendered post controls, including the multi-quote island. Place beside the post’s action links. |

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
| `regions` | `{ readonly form: ReactNode; readonly toolbar: ReactNode }` |  |

**`regions.form`**

The app-rendered `<form>` carrying the Server Action and its controls.

**`regions.toolbar`**

Optional toolbar region. The built-in composer supplies null because its toolbar is inside `form`, beside the textarea. A null toolbar must leave the form usable.

### EditorToolbar

`client` · stable

Formatting toolbar, preview, attachment picker. Mounted beside the textarea; removing it must leave a working plain-textarea form.

Props: `EditorToolbarModel`

| Field | Type | Notes |
|---|---|---|
| `textareaId` | `string` | The textarea's `id`; the island attaches to it rather than owning it. |
| `groupLabel` | `string` | Accessible name for the toolbar's `role="group"`. |
| `buttons` | `readonly EditorToolbarButtonModel[]` |  |
| `attachment` | `{ readonly inputId: string; readonly label: string } \| null` | Attachment picker or null. `inputId` targets the app-owned hidden file input. An enhanced button may activate it; the app owns upload handling. |
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
| `groups` | `readonly GroupTagModel[] \| undefined` | optional — Displayed groups, with display group first, then display order, capped by Maximum displayed groups. Use title only when groups is empty. |
| `joinedAt` | `TimeModel` |  |
| `lastVisitAt` | `TimeModel \| null` |  |
| `postCount` | `CountModel` |  |
| `signatureHtml` | `string \| null` |  |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | Custom profile fields, already filtered by visibility. |
| `actions` | `readonly LinkModel[]` |  |
| `regions` | `{ readonly plugins?: ReactNode }` | optional |

**`regions.plugins`**

The `profile.panel` region.

### SearchForm

`server` · stable

GET search form with supplied input names.

Props: `SearchFormModel`

| Field | Type | Notes |
|---|---|---|
| `action` | `string` | Where the form submits. A GET form: a search is a URL. |
| `fields` | `{ readonly query: string; readonly forum: string; readonly sort: string }` | The names to give the controls, owned by the app. |
| `query` | `string` |  |
| `maxQueryLength` | `number` | The server's limit, so the browser can refuse over-long input first. |
| `forums` | `readonly OptionModel[]` | Forums this viewer may search. The first option is "everywhere". |
| `sorts` | `readonly OptionModel[]` |  |
| `hint` | `string \| null` | Guidance for an empty form: quoting, exclusion. `null` once submitted. |
| `errorMessage` | `string \| null` |  |
| `advanced` | `SearchAdvancedModel` | optional — Optional author, date, forum and result-type controls. Omitted controls use the default search scope. |

### SearchResults

`server` · stable

Search hits, excerpts and filtering controls.

Props: `SearchResultsModel`

| Field | Type | Notes |
|---|---|---|
| `terms` | `string` | What was searched for, as the reader typed it. |
| `searchedAt` | `TimeModel` |  |
| `hits` | `readonly SearchHitModel[]` |  |
| `nextHref` | `string \| null` | Legacy next-page link, or null at the end. Prefer `regions.pagination`; render only one pager. |
| `nextLabel` | `string` |  |
| `newSearchHref` | `string` | Back to an empty form. Always offered: a search that found nothing needs it most. |
| `within` | `{ readonly action: string; readonly field: string; readonly value: string; readonly label: string; readonly hint: string; readonly submitLabel: string; readonly hidden?: readonly HiddenFieldModel[] }` | GET filter form. Preserve each `hidden` input so narrowing retains the original advanced options. |
| `refine` | `SearchRefineModel` | optional — Filtering and sorting for the set on screen. Optional: a theme that ignores it shows the results as the search asked for them. |
| `regions` | `{ readonly pagination?: ReactNode }` | optional |

**`regions.pagination`**

The `Pagination` for this result set, rendered by the page.

### DiscoveryView

`server` · stable

Discovery listing with the viewer’s available tabs.

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
| `refusal` | `{ readonly message: string; readonly signInHref: string; readonly signInLabel: string } \| null` | Access notice for a refused discovery view. Results are empty; signInHref provides the sign-in action. |

### PanelShell

`server` · stable

Member, moderator or admin panel frame with navigation and content.

Props: `PanelShellModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind` |  |
| `links` | `readonly LinkModel[]` | The other panels this viewer may reach, resolved and already filtered by permission. Never contains the panel being rendered. |
| `linksLabel` | `string` |  |
| `regions` | `{ readonly nav: ReactNode }` |  |
| `children` | `ReactNode` | optional |

**`regions.nav`**

The `PanelNav` for this panel.

### PanelNav

`server` · stable

Panel navigation with current state resolved by the app before rendering.

Props: `PanelNavModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind` |  |
| `label` | `string` | Accessible name for the navigation landmark. |
| `sections` | `readonly PanelNavSectionModel[]` |  |
| `currentTitle` | `string \| null` | The title of the deepest item the reader is under, for the current location beside a mobile navigation trigger. `null` when no path matched. |

### PanelPage

`server` · stable

Panel page heading, supporting text, actions and body.

Props: `PanelPageModel`

| Field | Type | Notes |
|---|---|---|
| `panel` | `PanelKind \| null` |  |
| `title` | `string` |  |
| `back` | `LinkModel \| null` | Where this page was reached from, when it is a page under another. |
| `frame` | `'panel' \| 'standalone'` | optional — `panel` fills an existing PanelShell; `standalone` supplies its own centred frame for pages such as online, statistics and reports. Defaults to panel. |
| `width` | `'reading' \| 'wide'` | `reading` for prose and forms, `wide` for a table nobody can read at reading width. The theme decides what each measures. |
| `gap` | `'normal' \| 'loose'` | `loose` for a page built of `PanelSection`s, `normal` for a page that is one thing. The theme decides what each measures; the distinction is whether the body has internal headings that need air around them. |
| `regions` | `{ readonly lede?: ReactNode; readonly meta?: ReactNode; readonly actions?: ReactNode }` |  |
| `children` | `ReactNode` | optional |

**`regions.lede`**

A sentence under the heading saying what this page is for.

**`regions.meta`**

Smaller detail under the lede — counts, timestamps, scope.

**`regions.actions`**

Controls that act on the whole page, beside the heading.

### PanelSection

`server` · stable

Labelled content section inside a panel page.

Props: `PanelSectionModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `headingId` | `string` | Heading ID used by the section landmark. |
| `regions` | `{ readonly description?: ReactNode; readonly actions?: ReactNode }` |  |
| `children` | `ReactNode` | optional |

### AuthPage

`server` · stable

Authentication-page frame with an app-rendered form.

Props: `AuthPageModel`

| Field | Type | Notes |
|---|---|---|
| `title` | `string` |  |
| `alert` | `string \| null` | `null` unless something about the way in went wrong. |
| `links` | `readonly AuthLinkModel[]` |  |
| `regions` | `{ readonly lede?: ReactNode; readonly form?: ReactNode; readonly note?: ReactNode }` |  |

**`regions.lede`**

A sentence under the heading.

**`regions.form`**

The form itself, or nothing on a page that only explains something.

**`regions.note`**

Standing advice beside the form — where to look before asking again.

### ForumJump

`server` · stable

GET forum selector with a submit button; keyboard selection must not navigate automatically.

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

Post-action notice with a meta-refresh destination and fallback link.

Props: `RedirectNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `message` | `string` |  |
| `targetHref` | `string` |  |
| `delaySeconds` | `number` |  |

### ErrorNotice

`server` · stable

Error or not-found content. Must render without database access.

Props: `ErrorNoticeModel`

| Field | Type | Notes |
|---|---|---|
| `status` | `number` |  |
| `title` | `string` |  |
| `message` | `string` |  |
| `homeHref` | `string` |  |
| `requestId` | `string \| null` | The request id, so a user can quote it in a report. |

## Shared models

Fields reached from a stable slot share its stability guarantee.

### AuthLinkModel

Authentication-page link and its optional introductory copy. The theme may present the link alone or with its `lead`.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` | from `LinkModel` |
| `href` | `string` | from `LinkModel` |
| `group` | `string` | from `LinkModel` — optional — Link group. Insert a separator when consecutive values differ; do not depend on specific values. Absent values form one group. |
| `newTab` | `boolean` | from `LinkModel` — optional — Open in a new tab when true. Pair `target="_blank"` with `rel="noopener noreferrer"`. Optional since 0.16. |
| `submenu` | `readonly LinkModel[]` | from `LinkModel` — optional — One level of child links. Render them with keyboard and pointer access. The app does not nest submenus. Optional since 0.16. |
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

Editor control. Exactly one of `tag` and `insertion` is set. Use `applyEditorTag` for a built-in tag or `applyInsertion` for a plugin insertion; both operate on serializable edit data.

| Field | Type | Notes |
|---|---|---|
| `tag` | `EditorTag \| null` | One of the board's own commands, or `null` for a plugin's `insertion`. |
| `insertion` | `EditorInsertion \| null` | A plugin's own edit, or `null` for a built-in `tag`. |
| `label` | `string` |  |
| `title` | `string` | `label`, plus the keyboard shortcut when this tag has one, already formatted. |
| `keyShortcut` | `string \| null` | `aria-keyshortcuts`, e.g. `"Control+b"`, or `null` for a tag with no shortcut. |
| `icon` | `string \| null` | Optional theme icon name. Unknown or null names render no icon; the text label remains accessible. |
| `placeholder` | `string \| null` | Placeholder for an empty wrap/spoiler selection. Null when unnecessary and for insertion buttons. |

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

A displayed membership group. Apply `nameClass` to its name and use the supplied title and badge.

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
| `excerpt` | `string` | Plain-text post excerpt, flattened from Markdown and cut at a word boundary. Render as text. |
| `postedAt` | `TimeModel` |  |

### LatestThreadModel

Latest thread with its forum identity.

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
| `group` | `string` | optional — Link group. Insert a separator when consecutive values differ; do not depend on specific values. Absent values form one group. |
| `newTab` | `boolean` | optional — Open in a new tab when true. Pair `target="_blank"` with `rel="noopener noreferrer"`. Optional since 0.16. |
| `submenu` | `readonly LinkModel[]` | optional — One level of child links. Render them with keyboard and pointer access. The app does not nest submenus. Optional since 0.16. |

### LogoModel

Board logo sources prepared for the reader’s colour preference. If no logo is supplied, render the board name. Honour the optional dark source for system colour mode.

| Field | Type | Notes |
|---|---|---|
| `src` | `string` | The image to render. Already the right one for a forced colour scheme. |
| `darkSrc` | `string \| null` | Optional dark source for a `<picture>` with `(prefers-color-scheme: dark)`. Use the primary source as its fallback. |
| `alt` | `string` | Never empty — the board's name when the operator has set nothing. |

### OnlineMemberModel

Online visitor. Location titles and links are filtered by reader permissions.

| Field | Type | Notes |
|---|---|---|
| `userId` | `number \| null` | from `UserRefModel` — `null` when the account was deleted; `username` is still shown. |
| `username` | `string` | from `UserRefModel` |
| `profileHref` | `string \| null` | from `UserRefModel` |
| `nameClass` | `string \| null \| undefined` | from `UserRefModel` — optional — CSS class for the member’s group colour in both schemes, or null. Apply it to the member name. |
| `location` | `{ readonly label: string; readonly href: string \| null }` | Where they are, as this reader may be told. Never null — see `label`. |
| `isInvisible` | `boolean` | True only for staff, who see hidden members marked rather than absent. |
| `lastSeen` | `TimeModel` |  |

### OptionModel

Select or radio option with its current state in `isSelected`. Render the provided value and label.

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
| `isRecord` | `boolean` | Current contextual page reached outside the rail, such as a forum editor. Render as a label rather than a link. |

### PanelNavSectionModel

| Field | Type | Notes |
|---|---|---|
| `href` | `string` | from `PanelNavItemModel` |
| `title` | `string` | from `PanelNavItemModel` |
| `icon` | `PanelNavIcon \| null` | from `PanelNavItemModel` — What this item is about, for a themed icon. `null` on a child item. |
| `count` | `number \| null` | from `PanelNavItemModel` — A waiting count — the approval queue, unread messages — or `null`. |
| `current` | `PanelNavCurrent \| null` | from `PanelNavItemModel` — `null` when the reader is somewhere else entirely. |
| `isRecord` | `boolean` | from `PanelNavItemModel` — Current contextual page reached outside the rail, such as a forum editor. Render as a label rather than a link. |
| `children` | `readonly PanelNavItemModel[]` | Available destinations, including those in closed sections so a menu can expand them without navigation. A record child appears only on its page. |
| `isOpen` | `boolean` | The reader is on this section or inside it. |
| `isOverview` | `boolean` | The panel's front page, which sits above the sections rather than among them. Exactly one section carries this. |

### PostActionsModel

| Field | Type | Notes |
|---|---|---|
| `quoteHref` | `string \| null` |  |
| `editHref` | `string \| null` |  |
| `restoreHref` | `string \| null` | Restore action for a soft-deleted post. Mutually exclusive with editHref. |
| `historyHref` | `string \| null` | optional |
| `reportHref` | `string \| null` |  |
| `warnHref` | `string \| null` | Link to warn the author about this post. Null for self, guests or insufficient permissions. |
| `moderateHref` | `string \| null` | Reserved for non-inline moderation controls; currently null. Inline selection uses its separate model. |
| `rateHref` | `string \| null` | Post-specific reputation action. Null for the current author, disabled reputation or insufficient permission. |

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
| `nameClass` | `string \| null \| undefined` | from `UserRefModel` — optional — CSS class for the member’s group colour in both schemes, or null. Apply it to the member name. |
| `avatarUrl` | `string \| null` |  |
| `title` | `string \| null` | Display-group title or custom member title; null when absent. |
| `groups` | `readonly GroupTagModel[] \| undefined` | optional — Displayed groups, starting with the display group and limited by the board setting. Render this list instead of `title` when nonempty; otherwise use `title`, including custom titles. |
| `badge` | `LogoModel \| null \| undefined` | optional — Group badge, or null. Uses LogoModel; darkSrc is provided only for the system colour scheme. |
| `reputation` | `CountModel \| null \| undefined` | optional — This member's reputation, or `null` when the board has it switched off. A denormalised counter on `users`, so it costs the postbit nothing. |
| `postCount` | `CountModel` |  |
| `joinedAt` | `TimeModel \| null` |  |
| `signatureHtml` | `string \| null` | Pre-rendered Markdown. Trusted output of the board's own renderer. |
| `isOnline` | `boolean` | Online status visible to this reader. Invisible authors appear offline without modcp.access. Render as supplied. |
| `fields` | `readonly { readonly label: string; readonly value: string }[]` | Profile fields configured for post display and permitted for this viewer. Render labels and values as text. |

### PostBitModel

| Field | Type | Notes |
|---|---|---|
| `id` | `number` |  |
| `number` | `number` | Position within the thread, 1-based. What "#12" in the corner means. |
| `permalink` | `string` | `/thread/12-slug#post-3` — anchored by `number`, so the link says what the corner says. |
| `author` | `PostAuthorModel` |  |
| `bodyHtml` | `string` | Pre-rendered Markdown. |
| `quoteSource` | `string` | @deprecated Since theme API 0.5; removal scheduled for 1.0. Use `post.id` to request a server-authorized quote. |
| `postedAt` | `TimeModel` |  |
| `editedNote` | `string \| null` | "Last edited by X on Y", already assembled, or `null`. |
| `isFirstPost` | `boolean` |  |
| `visibility` | `'visible' \| 'unapproved' \| 'deleted'` | A moderator sees deleted and unapproved posts, marked as such. |
| `ignored` | `{ readonly authorUsername: string; readonly revealHref: string } \| null` | Ignored-author placeholder, or null. When set, the app withholds body, signature and custom fields while preserving post position and numbering. Render the placeholder and reveal link. |
| `attachments` | `readonly PostAttachmentModel[]` | Downloadable attachments only; pending and failed uploads are excluded. Use `thumbnailHref ?? href` for an inline image. Non-images and images without a smaller preview have a null thumbnail. |
| `actions` | `PostActionsModel` |  |

**`ignored.revealHref`**

Same page, this post revealed. A GET: revealing changes nothing.

### PrefixModel

A thread prefix; `token` supplies its styling.

| Field | Type | Notes |
|---|---|---|
| `label` | `string` |  |
| `token` | `string \| null` |  |

### SearchAdvancedModel

Advanced search controls. Keep open when `isOpen` is true so applied filters are visible. Always-open rendering is also supported.

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

Select control with its submitted name, label and options. Render controls in the supplied order.

| Field | Type | Notes |
|---|---|---|
| `field` | `string` |  |
| `label` | `string` |  |
| `options` | `readonly OptionModel[]` |  |

### SearchHitModel

Search result with destination and excerpt. `excerptHtml` contains app-generated match emphasis; source markup is stripped. Render other fields as text.

| Field | Type | Notes |
|---|---|---|
| `postId` | `number` |  |
| `threadTitle` | `string` |  |
| `href` | `string` | Resolved to the post inside its thread, page and anchor included. |
| `excerptHtml` | `string` |  |
| `authorUsername` | `string` |  |
| `postedAt` | `TimeModel` |  |

### SearchRefineModel

Results filters: count, sort links, applied-filter removal links and a GET form. Preserve existing filters in supplied hrefs and hidden inputs. Option counts exclude forum/author narrowing; `note` identifies lower-bound counts. Keep labels, touch targets and long values readable without horizontal page scrolling.

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

Inline-moderation checkbox or null when unavailable. Associate it with the app-owned form using `formId` and HTML’s `form` attribute. Do not nest forms around listings.

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
| `visibility` | `'visible' \| 'unapproved' \| 'deleted'` | optional — Thread visibility. Unapproved/deleted rows are supplied only when the viewer is permitted to see them. Render the corresponding state. |
| `lastPost` | `LastPostModel \| null` |  |

### ThreadWatchModel

Thread watch toggle. Submit the supplied `action`; use `subscribed` for the label/state. It uses the board’s default cadence. The full cadence selector remains in `afterContent`.

| Field | Type | Notes |
|---|---|---|
| `subscribed` | `boolean` |  |
| `action` | `string` | A native POST target that flips `subscribed`. |

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
| `nameClass` | `string \| null \| undefined` | optional — CSS class for the member’s group colour in both schemes, or null. Apply it to the member name. |

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
| `canAccessModCp` | `boolean` | Rendering hint for moderator-panel access, already resolved by the Authorizer. The destination still checks access; this field does not grant it. |

## Scheduled removals

No deprecations in v0.24.
