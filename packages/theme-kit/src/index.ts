/**
 * `@forum/theme-kit` — the contract between the app and a theme (F25).
 *
 * Three things, and F77 freezes all three as v1:
 *
 *  - `SLOTS` — every replaceable region, each declaring server or client kind;
 *  - `SlotModels` — the JSON-shaped props each slot is handed;
 *  - `defineTheme`/`resolveTheme` — how a theme is declared and inherited.
 *
 * Nothing here touches a database, a request, or `@forum/db`: a theme renders
 * what it is handed (R6), and dependency-cruiser's `themes-are-presentation-only`
 * keeps it that way.
 */

export {
  SLOTS,
  SLOT_NAMES,
  isSlotName,
  slotKind,
  type SlotKind,
  type SlotName,
  type SlotSpec,
} from './slots'

export {
  defineTheme,
  resolveTheme,
  requireSlot,
  hasSlot,
  assertComplete,
  type PartialSlotImplementations,
  type ResolvedTheme,
  type SlotComponent,
  type SlotImplementations,
  type ThemeDefinition,
} from './theme'

export type {
  BoardIndexModel,
  BoardStatsModel,
  OnlineMemberModel,
  CategoryBlockModel,
  EditorToolbarModel,
  ErrorNoticeModel,
  FooterModel,
  ForumDisplayModel,
  ForumRowModel,
  ForumRowSlotModel,
  HeaderModel,
  LastPostModel,
  LinkModel,
  MemberProfileModel,
  NavigationModel,
  NoticeModel,
  PaginationModel,
  PostActionsModel,
  PostActionsSlotModel,
  PostAuthorModel,
  PostAttachmentModel,
  PostBitModel,
  PostBitSlotModel,
  PostFormModel,
  PrefixModel,
  QuickReplyModel,
  RedirectNoticeModel,
  SearchFormModel,
  SelectionModel,
  Serialisable,
  ShellModel,
  SlotModels,
  SubforumListModel,
  ThreadRowModel,
  ThreadRowSlotModel,
  ThreadViewModel,
  TimeModel,
  UserPanelModel,
  UserRefModel,
  ViewerModel,
  WhoIsOnlineModel,
} from './view-models'
