import { defineTheme } from '@meith/theme-kit'

import {
  announcementCopy,
  boardIndexCopy,
  boardStatsCopy,
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

export const defaultTheme = defineTheme({
  key: 'default',
  title: 'Default',
  version: '0.34.0',
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
  copy: {
    Shell: shellCopy,
    Header: headerCopy,
    UserPanel: userPanelCopy,
    Navigation: navigationCopy,
    Footer: footerCopy,
    Notice: noticeCopy,
    Announcement: announcementCopy,

    BoardIndex: boardIndexCopy,
    ForumRow: forumRowCopy,
    BoardStats: boardStatsCopy,
    WhoIsOnline: whoIsOnlineCopy,
    LatestThreads: latestThreadsCopy,
    LatestPosts: latestPostsCopy,

    ForumDisplay: forumDisplayCopy,
    SubforumList: subforumListCopy,
    ThreadRow: threadRowCopy,
    Pagination: paginationCopy,

    ThreadView: threadViewCopy,
    PostBit: postBitCopy,
    PostActions: postActionsCopy,

    PostForm: postFormCopy,

    MemberProfile: memberProfileCopy,

    SearchForm: searchFormCopy,
    SearchResults: searchResultsCopy,

    DiscoveryView: discoveryViewCopy,

    PanelNav: panelNavCopy,
    PanelPage: panelPageCopy,

    RedirectNotice: redirectNoticeCopy,
    ErrorNotice: errorNoticeCopy,
  },
})
