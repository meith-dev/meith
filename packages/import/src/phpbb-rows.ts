export interface PhpbbUser {
  readonly user_id: number
  readonly user_type: number
  readonly username: string
  readonly user_email: string
  readonly user_password: string
  readonly user_regdate: number
  readonly user_lastvisit: number
  readonly user_posts: number
  readonly group_id: number
}

export interface PhpbbForum {
  readonly forum_id: number
  readonly parent_id: number
  readonly forum_name: string
  readonly forum_desc: string
  readonly forum_type: number
  readonly forum_link: string
  readonly left_id: number
}

export interface PhpbbTopic {
  readonly topic_id: number
  readonly forum_id: number
  readonly topic_title: string
  readonly topic_poster: number
  readonly topic_first_poster_name: string
  readonly topic_time: number
  readonly topic_last_post_time: number
  readonly topic_views: number
  readonly topic_posts_approved: number
  readonly topic_status: number
  readonly topic_type: number
  readonly topic_visibility: number
  readonly topic_moved_id: number
}

export interface PhpbbPost {
  readonly post_id: number
  readonly topic_id: number
  readonly forum_id: number
  readonly poster_id: number
  readonly post_username: string
  readonly post_subject: string
  readonly post_text: string
  readonly bbcode_uid: string
  readonly post_time: number
  readonly post_edit_time: number
  readonly post_visibility: number
}

export interface PhpbbAvatarRow {
  readonly user_id: number
  readonly user_avatar: string
  readonly user_avatar_type: string
  readonly user_avatar_width: number
  readonly user_avatar_height: number
}

export interface PhpbbAttachment {
  readonly attach_id: number
  readonly post_msg_id: number
  readonly poster_id: number
  readonly real_filename: string
  readonly physical_filename: string
  readonly mimetype: string
  readonly filesize: number
  readonly download_count: number
  readonly filetime: number
  readonly thumbnail: number
}

export interface PhpbbPollTopic {
  readonly topic_id: number
  readonly poll_title: string
  readonly poll_start: number
  readonly poll_length: number
}

export interface PhpbbPollOption {
  readonly topic_id: number
  readonly poll_option_id: number
  readonly poll_option_text: string
  readonly poll_option_total: number
}

export interface PhpbbPollVote {
  readonly topic_id: number
  readonly poll_option_id: number
  readonly vote_user_id: number
}

export interface PhpbbPrivateMessage {
  readonly msg_id: number
  readonly author_id: number
  readonly message_subject: string
  readonly message_text: string
  readonly bbcode_uid: string
  readonly message_time: number
}

export interface PhpbbPrivateMessageCopy {
  readonly msg_id: number
  readonly user_id: number
  readonly author_id: number
  readonly folder_id: number
  readonly pm_deleted: number
  readonly pm_unread: number
}

export interface PhpbbWatch {
  readonly user_id: number
  readonly target_id: number
}

export interface PhpbbWarning {
  readonly warning_id: number
  readonly user_id: number
  readonly post_id: number
  readonly warning_time: number
}

export interface PhpbbBan {
  readonly ban_id: number
  readonly ban_userid: number
  readonly ban_start: number
  readonly ban_end: number
  readonly ban_exclude: number
  readonly ban_reason: string
  readonly ban_give_reason: string
}

export interface PhpbbZebra {
  readonly user_id: number
  readonly zebra_id: number
  readonly friend: number
  readonly foe: number
}

export interface PhpbbTables {
  readonly users?: readonly PhpbbUser[]
  readonly forums?: readonly PhpbbForum[]
  readonly topics?: readonly PhpbbTopic[]
  readonly posts?: readonly PhpbbPost[]
  readonly avatars?: readonly PhpbbAvatarRow[]
  readonly attachments?: readonly PhpbbAttachment[]
  readonly pollTopics?: readonly PhpbbPollTopic[]
  readonly pollOptions?: readonly PhpbbPollOption[]
  readonly pollVotes?: readonly PhpbbPollVote[]
  readonly privateMessages?: readonly PhpbbPrivateMessage[]
  readonly privateMessageCopies?: readonly PhpbbPrivateMessageCopy[]
  readonly topicWatch?: readonly PhpbbWatch[]
  readonly forumWatch?: readonly PhpbbWatch[]
  readonly warnings?: readonly PhpbbWarning[]
  readonly bans?: readonly PhpbbBan[]
  readonly zebra?: readonly PhpbbZebra[]
}
