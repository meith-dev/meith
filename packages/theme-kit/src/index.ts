/**
 * `@meith/theme-kit` — the contract between the app and a theme (F25).
 *
 * Three things, frozen as the **slot contract** by F77:
 *
 *  - `SLOTS` — every replaceable region, each declaring server or client kind;
 *  - `SlotModels` — the JSON-shaped props each slot is handed;
 *  - `defineTheme`/`resolveTheme` — how a theme is declared and inherited.
 *
 * What the freeze means, what it does not cover, and how something is removed
 * from it are in `api.ts` and in docs/theme-api.md; the reference generated from
 * both is docs/theme-slots.md.
 *
 * **Everything exported here is public API.** A module not re-exported from this
 * barrel is an internal, whatever its file permissions look like.
 *
 * Nothing here touches a database, a request, or `@meith/db`: a theme renders
 * what it is handed (R6), and dependency-cruiser's `themes-are-presentation-only`
 * keeps it that way.
 */

export {
  THEME_API_VERSION,
  SLOT_STABILITY,
  DEPRECATIONS,
  assertDeprecationPolicy,
  assertThemeContract,
  checkThemeContract,
  compareApiVersions,
  deprecationsFor,
  parseApiVersion,
  requiredSlots,
  type ApiVersion,
  type Deprecation,
  type Stability,
  type ThemeContractReport,
} from './api'

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
  AnnouncementModel,
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
  LogoModel,
  LastPostModel,
  LatestPostModel,
  LatestPostsModel,
  LatestThreadModel,
  LatestThreadsModel,
  LinkModel,
  MemberProfileModel,
  NavigationModel,
  NoticeModel,
  OptionModel,
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
  ForumJumpModel,
  ForumJumpOption,
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
