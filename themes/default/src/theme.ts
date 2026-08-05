/**
 * The default theme's manifest (F25).
 *
 * Slots are listed literally, each one a bare identifier imported directly above.
 * That is a requirement, not a style: `scripts/slot-kinds.mjs` resolves each
 * binding to its module to check which side of the server/client boundary the
 * implementation is on, and a slot map assembled dynamically cannot be checked.
 *
 * **This theme satisfies the theme-kit contract (F77) and is still not complete**, and the
 * difference is the freeze: it fills every `stable` slot, and leaves the two
 * `provisional` ones — `QuickReply` and `EditorToolbar` — unimplemented, because
 * F45 does not exist and a placeholder island would look like a feature.
 * `assertThemeContract` in `apps/forum/src/server/theme.ts` fails the boot if a
 * required slot ever goes missing; `resolveTheme` still reports the provisional
 * pair as missing, which is accurate.
 *
 * ## What this theme is trying to be
 *
 * A board somebody else's community can wear without asking who wrote it.
 *
 * The palette is fully neutral — every grey at chroma zero, `primary` is ink
 * rather than a house colour — so an operator who sets two tokens in the control
 * panel has a branded board and nothing else in the design arguing with the
 * result. `src/tokens.ts` has the long version of that argument. The semantic
 * colours keep their hues, because `thread-locked` is information rather than
 * decoration, and every state a hue marks is also a word in the markup.
 *
 * The components come from `@meith/ui` — shadcn/ui's vocabulary on Base UI's
 * primitives. Almost all of it renders on the server: a card, a badge and a
 * field are markup and class names, and a thread page of fifty postbits cannot
 * afford a client boundary behind any of them. Base UI is reached for exactly
 * where behaviour is genuinely needed, and on this board that turns out to be a
 * submit button that reports its own pending state. That is not Base UI being
 * unused; it is a board that is honest about how little of it needs JavaScript.
 *
 * ## Slots, and the one coupling inside this theme
 *
 * `CategoryBlock` and `ForumDisplay` supply the `<ul>` that `ForumRow` and
 * `ThreadRow` return `<li>`s into. Those pairs move together. A theme that
 * inherits one and overrides the other gets markup browsers silently unwrap —
 * nothing throws, the rows simply vanish from the layout. `themes/midnight`
 * overrides all four to render tables, and pins the pairing in its own test.
 */

import { defineTheme } from '@meith/theme-kit'

import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { WhoIsOnline } from './slots/who-is-online'
import { Footer } from './slots/footer'
import { ForumRow } from './slots/forum-row'
import { ForumDisplay } from './slots/forum-display'
import { Header } from './slots/header'
import { Navigation } from './slots/navigation'
import { Notice } from './slots/notice'
import { Announcement } from './slots/announcement'
import { Shell } from './slots/shell'
import { UserPanel } from './slots/user-panel'
import { Pagination } from './slots/pagination'
import { SubforumList } from './slots/subforum-list'
import { ThreadRow } from './slots/thread-row'
import { ThreadView } from './slots/thread-view'
import { PostBit } from './slots/post-bit'
import { PostForm } from './slots/post-form'
import { PostActions } from './slots/post-actions'
import { MemberProfile } from './slots/member-profile'
import { ForumJump } from './slots/forum-jump'
import { SearchForm } from './slots/search-form'
import { RedirectNotice } from './slots/redirect-notice'
import { ErrorNotice } from './slots/error-notice'

export const defaultTheme = defineTheme({
  key: 'default',
  title: 'Default',
  slots: {
    Shell,
    Header,
    UserPanel,
    Navigation,
    Footer,
    Notice,
    Announcement,

    BoardIndex,
    CategoryBlock,
    ForumRow,
    BoardStats,
    WhoIsOnline,

    ForumDisplay,
    ThreadRow,
    SubforumList,
    Pagination,

    ThreadView,
    PostBit,
    PostActions,

    PostForm,

    MemberProfile,

    SearchForm,
    ForumJump,

    RedirectNotice,
    ErrorNotice,
  },
})
