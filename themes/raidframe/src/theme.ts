import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import {
  announcementCopy,
  authPageCopy,
  boardIndexCopy,
  boardStatsCopy,
  categoryBlockCopy,
  discoveryViewCopy,
  errorNoticeCopy,
  footerCopy,
  forumDisplayCopy,
  forumRowCopy,
  headerCopy,
  latestPostsCopy,
  latestThreadsCopy,
  memberProfileCopy,
  navigationCopy,
  noticeCopy,
  paginationCopy,
  panelNavCopy,
  panelPageCopy,
  postActionsCopy,
  postBitCopy,
  postFormCopy,
  redirectNoticeCopy,
  searchFormCopy,
  searchResultsCopy,
  shellCopy,
  subforumListCopy,
  threadRowCopy,
  threadViewCopy,
  userPanelCopy,
  whoIsOnlineCopy,
} from './copy'
import { Announcement } from './slots/announcement'
import { AuthPage } from './slots/auth-page'
import { BoardIndex } from './slots/board-index'
import { BoardStats } from './slots/board-stats'
import { CategoryBlock } from './slots/category-block'
import { DiscoveryView } from './slots/discovery-view'
import { EditorToolbar } from './slots/editor-toolbar'
import { ErrorNotice } from './slots/error-notice'
import { Footer } from './slots/footer'
import { ForumDisplay } from './slots/forum-display'
import { ForumJump } from './slots/forum-jump'
import { ForumRow } from './slots/forum-row'
import { Header } from './slots/header'
import { LatestPosts } from './slots/latest-posts'
import { LatestThreads } from './slots/latest-threads'
import { MemberProfile } from './slots/member-profile'
import { Navigation } from './slots/navigation'
import { Notice } from './slots/notice'
import { Pagination } from './slots/pagination'
import { PanelNav } from './slots/panel-nav'
import { PanelPage, PanelSection } from './slots/panel-page'
import { PanelShell } from './slots/panel-shell'
import { PostActions } from './slots/post-actions'
import { PostBit } from './slots/post-bit'
import { PostForm } from './slots/post-form'
import { QuickReply } from './slots/quick-reply'
import { RedirectNotice } from './slots/redirect-notice'
import { SearchForm } from './slots/search-form'
import { SearchResults } from './slots/search-results'
import { Shell } from './slots/shell'
import { SubforumList } from './slots/subforum-list'
import { ThreadRow } from './slots/thread-row'
import { ThreadView } from './slots/thread-view'
import { UserPanel } from './slots/user-panel'
import { WhoIsOnline } from './slots/who-is-online'

export const raidframeTheme = defineTheme({
  key: 'raidframe',
  title: 'Raidframe',
  version: '0.33.1',
  extends: defaultTheme,
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
    QuickReply,

    PostForm,
    EditorToolbar,
    MemberProfile,
    SearchForm,
    SearchResults,
    DiscoveryView,
    ForumJump,

    PanelShell,
    PanelNav,
    PanelPage,
    PanelSection,
    AuthPage,

    RedirectNotice,
    ErrorNotice,
  },
  copy: {
    Announcement: announcementCopy,
    AuthPage: authPageCopy,
    BoardIndex: boardIndexCopy,
    BoardStats: boardStatsCopy,
    CategoryBlock: categoryBlockCopy,
    DiscoveryView: discoveryViewCopy,
    ErrorNotice: errorNoticeCopy,
    Footer: footerCopy,
    ForumDisplay: forumDisplayCopy,
    ForumRow: forumRowCopy,
    Header: headerCopy,
    LatestPosts: latestPostsCopy,
    LatestThreads: latestThreadsCopy,
    MemberProfile: memberProfileCopy,
    Navigation: navigationCopy,
    Notice: noticeCopy,
    Pagination: paginationCopy,
    PanelNav: panelNavCopy,
    PanelPage: panelPageCopy,
    PostActions: postActionsCopy,
    PostBit: postBitCopy,
    PostForm: postFormCopy,
    RedirectNotice: redirectNoticeCopy,
    SearchForm: searchFormCopy,
    SearchResults: searchResultsCopy,
    Shell: shellCopy,
    SubforumList: subforumListCopy,
    ThreadRow: threadRowCopy,
    ThreadView: threadViewCopy,
    UserPanel: userPanelCopy,
    WhoIsOnline: whoIsOnlineCopy,
  },
})
