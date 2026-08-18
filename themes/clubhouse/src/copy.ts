import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.announcement.clubNotice',
    'clubhouse.announcement.posted',
    'clubhouse.announcement.postedBy',
  ])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['clubhouse.boardIndex.boardActivity', 'clubhouse.boardIndex.markAllRead'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.boardStats.counted',
    'clubhouse.boardStats.heading',
    'clubhouse.boardStats.members',
    'clubhouse.boardStats.newest',
    'clubhouse.boardStats.notComputed',
    'clubhouse.boardStats.posts',
    'clubhouse.boardStats.threads',
  ])
}

export function categoryBlockCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.categoryBlock.forum',
    'clubhouse.categoryBlock.lastPost',
    'clubhouse.categoryBlock.posts',
    'clubhouse.categoryBlock.threads',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['clubhouse.footer.footerNav', 'clubhouse.footer.timesShownIn'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.forumDisplay.emptyNoThread',
    'clubhouse.forumDisplay.emptyNoThreadFirst',
    'clubhouse.forumDisplay.latest',
    'clubhouse.forumDisplay.markRead',
    'clubhouse.forumDisplay.newThread',
    'clubhouse.forumDisplay.noThreadsYet',
    'clubhouse.forumDisplay.posts',
    'clubhouse.forumDisplay.replies',
    'clubhouse.forumDisplay.startFirstThread',
    'clubhouse.forumDisplay.thread',
    'clubhouse.forumDisplay.threads',
    'clubhouse.forumDisplay.views',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.forumRow.link',
    'clubhouse.forumRow.newPosts',
    'clubhouse.forumRow.noPostsYet',
    'clubhouse.forumRow.posts',
    'clubhouse.forumRow.threads',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['clubhouse.header.boardSections'])
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.latestPosts.asOf',
    'clubhouse.latestPosts.in',
    'clubhouse.latestPosts.newestPostsEmpty',
    'clubhouse.latestPosts.nothingSaidYet',
    'clubhouse.latestPosts.title',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.latestThreads.asOf',
    'clubhouse.latestThreads.in',
    'clubhouse.latestThreads.newestThreadsEmpty',
    'clubhouse.latestThreads.nothingStartedYet',
    'clubhouse.latestThreads.title',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.memberProfile.about',
    'clubhouse.memberProfile.joined',
    'clubhouse.memberProfile.lastVisit',
    'clubhouse.memberProfile.memberActions',
    'clubhouse.memberProfile.never',
    'clubhouse.memberProfile.posts',
    'clubhouse.memberProfile.signature',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['clubhouse.navigation.breadcrumb'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.notice.dismiss',
    'clubhouse.notice.kindError',
    'clubhouse.notice.kindInfo',
    'clubhouse.notice.kindSuccess',
    'clubhouse.notice.kindWarning',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.pagination.next',
    'clubhouse.pagination.of',
    'clubhouse.pagination.page',
    'clubhouse.pagination.pagination',
    'clubhouse.pagination.previous',
  ])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.postActions.edit',
    'clubhouse.postActions.moderate',
    'clubhouse.postActions.postActions',
    'clubhouse.postActions.quote',
    'clubhouse.postActions.rate',
    'clubhouse.postActions.report',
    'clubhouse.postActions.restore',
    'clubhouse.postActions.warn',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.postBit.attachment.one',
    'clubhouse.postBit.attachment.other',
    'clubhouse.postBit.deletedPost',
    'clubhouse.postBit.ignoring',
    'clubhouse.postBit.joined',
    'clubhouse.postBit.online',
    'clubhouse.postBit.openingPost',
    'clubhouse.postBit.postHidden',
    'clubhouse.postBit.posts',
    'clubhouse.postBit.rep',
    'clubhouse.postBit.showAnyway',
    'clubhouse.postBit.staffOnly',
    'clubhouse.postBit.waitingApproval',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['clubhouse.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.subforumList.posts',
    'clubhouse.subforumList.threads',
    'clubhouse.subforumList.title',
  ])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.threadRow.latestReply',
    'clubhouse.threadRow.locked',
    'clubhouse.threadRow.moved',
    'clubhouse.threadRow.newPosts',
    'clubhouse.threadRow.noRepliesYet',
    'clubhouse.threadRow.pinned',
    'clubhouse.threadRow.replies',
    'clubhouse.threadRow.startedBy',
    'clubhouse.threadRow.views',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.threadView.lockedNoReplies',
    'clubhouse.threadView.markRead',
    'clubhouse.threadView.moved',
    'clubhouse.threadView.pinned',
    'clubhouse.threadView.replies',
    'clubhouse.threadView.reply',
    'clubhouse.threadView.views',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.userPanel.new',
    'clubhouse.userPanel.signedIn',
    'clubhouse.userPanel.unread',
    'clubhouse.userPanel.unreadMessages',
    'clubhouse.userPanel.unreadNotifications',
    'clubhouse.userPanel.yourAccount',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'clubhouse.whoIsOnline.and',
    'clubhouse.whoIsOnline.guest.one',
    'clubhouse.whoIsOnline.guest.other',
    'clubhouse.whoIsOnline.heading',
    'clubhouse.whoIsOnline.invisible',
    'clubhouse.whoIsOnline.member.one',
    'clubhouse.whoIsOnline.member.other',
    'clubhouse.whoIsOnline.more',
    'clubhouse.whoIsOnline.nobody',
    'clubhouse.whoIsOnline.online',
    'clubhouse.whoIsOnline.onlyGuests',
    'clubhouse.whoIsOnline.record',
    'clubhouse.whoIsOnline.seeEveryone',
  ])
}
