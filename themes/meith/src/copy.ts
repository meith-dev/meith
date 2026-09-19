import { mobileHeaderNavCopy } from '@meith/theme-default'
import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function announcementCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.announcement.label',
    'meith.announcement.posted',
    'meith.announcement.postedBy',
    'meith.announcement.dot',
  ])
}

export function boardIndexCopy(t: Translator): SlotCopy {
  return copyFor(t, ['meith.boardIndex.markAllRead', 'meith.boardIndex.boardActivity'])
}

export function boardStatsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.boardStats.heading',
    'meith.boardStats.notComputed',
    'meith.boardStats.threads',
    'meith.boardStats.posts',
    'meith.boardStats.members',
    'meith.boardStats.newestMember',
    'meith.boardStats.counted',
  ])
}

export function footerCopy(t: Translator): SlotCopy {
  return copyFor(t, ['meith.footer.nav', 'meith.footer.timesShownIn'])
}

export function forumDisplayCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.forumDisplay.label',
    'meith.forumDisplay.threadsLabel',
    'meith.forumDisplay.thread.one',
    'meith.forumDisplay.thread.other',
    'meith.forumDisplay.postsLabel',
    'meith.forumDisplay.post.one',
    'meith.forumDisplay.post.other',
    'meith.forumDisplay.markRead',
    'meith.forumDisplay.newThread',
    'meith.forumDisplay.threadHeader',
    'meith.forumDisplay.activityHeader',
    'meith.forumDisplay.lastPostHeader',
    'meith.forumDisplay.noThreadsYet',
    'meith.forumDisplay.emptyNoThread',
    'meith.forumDisplay.emptyNoThreadFirst',
    'meith.forumDisplay.startFirstThread',
  ])
}

export function forumRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.forumRow.newPosts',
    'meith.forumRow.subforums',
    'meith.forumRow.slash',
    'meith.forumRow.threadsLabel',
    'meith.forumRow.thread.one',
    'meith.forumRow.thread.other',
    'meith.forumRow.postsLabel',
    'meith.forumRow.post.one',
    'meith.forumRow.post.other',
    'meith.forumRow.noPostsYet',
    'meith.forumRow.dot',
  ])
}

export function headerCopy(t: Translator): SlotCopy {
  return { ...mobileHeaderNavCopy(t), ...copyFor(t, ['meith.header.sections']) }
}

export function latestPostsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.latestPosts.heading',
    'meith.latestPosts.asOf',
    'meith.latestPosts.nothingYet',
    'meith.latestPosts.emptyDescription',
    'meith.latestPosts.in',
    'meith.latestPosts.dot',
  ])
}

export function latestThreadsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.latestThreads.heading',
    'meith.latestThreads.asOf',
    'meith.latestThreads.nothingYet',
    'meith.latestThreads.emptyDescription',
    'meith.latestThreads.reply.one',
    'meith.latestThreads.reply.other',
    'meith.latestThreads.in',
    'meith.latestThreads.dot',
  ])
}

export function memberProfileCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.memberProfile.label',
    'meith.memberProfile.memberActions',
    'meith.memberProfile.postsLabel',
    'meith.memberProfile.joinedLabel',
    'meith.memberProfile.lastVisitLabel',
    'meith.memberProfile.never',
    'meith.memberProfile.about',
    'meith.memberProfile.signature',
  ])
}

export function navigationCopy(t: Translator): SlotCopy {
  return copyFor(t, ['meith.navigation.breadcrumb', 'meith.navigation.separator'])
}

export function noticeCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.notice.info',
    'meith.notice.success',
    'meith.notice.warning',
    'meith.notice.error',
    'meith.notice.dismiss',
  ])
}

export function paginationCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.pagination.nav',
    'meith.pagination.previousArrow',
    'meith.pagination.previous',
    'meith.pagination.ellipsis',
    'meith.pagination.page',
    'meith.pagination.of',
    'meith.pagination.next',
    'meith.pagination.nextArrow',
  ])
}

export function postActionsCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.postActions.quote',
    'meith.postActions.edit',
    'meith.postActions.history',
    'meith.postActions.rate',
    'meith.postActions.report',
    'meith.postActions.restore',
    'meith.postActions.warn',
    'meith.postActions.moderate',
    'meith.postActions.nav',
  ])
}

export function postBitCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.postBit.deletedPost',
    'meith.postBit.waitingApproval',
    'meith.postBit.staffOnly',
    'meith.postBit.online',
    'meith.postBit.postsLabel',
    'meith.postBit.post.one',
    'meith.postBit.post.other',
    'meith.postBit.reputationLabel',
    'meith.postBit.reputation',
    'meith.postBit.joined',
    'meith.postBit.ignoringPrefix',
    'meith.postBit.hiddenNotice',
    'meith.postBit.showAnyway',
    'meith.postBit.attachment.one',
    'meith.postBit.attachment.other',
  ])
}

export function shellCopy(t: Translator): SlotCopy {
  return copyFor(t, ['meith.shell.skipToContent'])
}

export function subforumListCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.subforumList.heading',
    'meith.subforumList.threadsLabel',
    'meith.subforumList.thread.one',
    'meith.subforumList.thread.other',
    'meith.subforumList.postsLabel',
    'meith.subforumList.post.one',
    'meith.subforumList.post.other',
  ])
}

export function threadRowCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.threadRow.pinned',
    'meith.threadRow.locked',
    'meith.threadRow.moved',
    'meith.threadRow.unapproved',
    'meith.threadRow.deleted',
    'meith.threadRow.newPosts',
    'meith.threadRow.startedBy',
    'meith.threadRow.repliesLabel',
    'meith.threadRow.reply.one',
    'meith.threadRow.reply.other',
    'meith.threadRow.viewsLabel',
    'meith.threadRow.view.one',
    'meith.threadRow.view.other',
    'meith.threadRow.noRepliesYet',
    'meith.threadRow.latestReply',
    'meith.threadRow.dot',
  ])
}

export function threadViewCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.threadView.label',
    'meith.threadView.pinned',
    'meith.threadView.locked',
    'meith.threadView.moved',
    'meith.threadView.repliesLabel',
    'meith.threadView.reply.one',
    'meith.threadView.reply.other',
    'meith.threadView.viewsLabel',
    'meith.threadView.view.one',
    'meith.threadView.view.other',
    'meith.threadView.watching',
    'meith.threadView.watch',
    'meith.threadView.markRead',
    'meith.threadView.replyAction',
  ])
}

export function userPanelCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.userPanel.signedIn',
    'meith.userPanel.unreadNotifications',
    'meith.userPanel.new',
    'meith.userPanel.unreadMessages',
    'meith.userPanel.unread',
    'meith.userPanel.yourAccount',
  ])
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'meith.whoIsOnline.heading',
    'meith.whoIsOnline.online',
    'meith.whoIsOnline.member.one',
    'meith.whoIsOnline.member.other',
    'meith.whoIsOnline.guest.one',
    'meith.whoIsOnline.guest.other',
    'meith.whoIsOnline.nobody',
    'meith.whoIsOnline.onlyGuests',
    'meith.whoIsOnline.and',
    'meith.whoIsOnline.more',
    'meith.whoIsOnline.seeEveryone',
    'meith.whoIsOnline.record',
    'meith.whoIsOnline.on',
    'meith.whoIsOnline.invisible',
  ])
}
