import { defineTheme } from '@meith/theme-kit'

import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { WhoIsOnline } from './slots/who-is-online'
import { Footer } from './slots/footer'
import { ForumRow } from './slots/forum-row'
import { LatestPosts } from './slots/latest-posts'
import { LatestThreads } from './slots/latest-threads'
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
import { AuthPage } from './slots/auth-page'
import { SearchResults } from './slots/search-results'
import { DiscoveryView } from './slots/discovery-view'
import { PanelShell } from './slots/panel-shell'
import { PanelNav } from './slots/panel-nav'
import { PanelPage, PanelSection } from './slots/panel-page'
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
    LatestThreads,
    LatestPosts,

    ForumDisplay,
    ThreadRow,
    SubforumList,
    Pagination,

    ThreadView,
    PostBit,
    PostActions,

    PostForm,

    MemberProfile,

    AuthPage,

    SearchForm,
    SearchResults,

    DiscoveryView,

    PanelShell,
    PanelNav,
    PanelPage,
    PanelSection,

    ForumJump,

    RedirectNotice,
    ErrorNotice,
  },
})
