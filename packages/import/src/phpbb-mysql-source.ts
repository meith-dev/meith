import {
  assertSafePrefix,
  connectMysql,
  keysetPage,
  type MysqlSourceOptions,
  mapPage,
  type Queryable,
  selectRows,
} from './mysql-source'
import {
  mapPhpbbAttachment,
  mapPhpbbAvatar,
  mapPhpbbBan,
  mapPhpbbForum,
  mapPhpbbPoll,
  mapPhpbbPollVote,
  mapPhpbbPost,
  mapPhpbbPrivateMessage,
  mapPhpbbTopic,
  mapPhpbbUser,
  mapPhpbbWarning,
  mapPhpbbWatch,
  mapPhpbbZebra,
  noPhpbbReputation,
} from './phpbb-map'
import type {
  PhpbbAttachment,
  PhpbbAvatarRow,
  PhpbbBan,
  PhpbbForum,
  PhpbbPollOption,
  PhpbbPollTopic,
  PhpbbPollVote,
  PhpbbPost,
  PhpbbPrivateMessage,
  PhpbbPrivateMessageCopy,
  PhpbbTopic,
  PhpbbUser,
  PhpbbWarning,
  PhpbbWatch,
  PhpbbZebra,
} from './phpbb-rows'
import { type ImportSource, type Page, pageByGroup } from './source'
import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'

export class MysqlPhpbbSource implements ImportSource {
  readonly name = 'phpbb'

  private constructor(
    private readonly connection: Queryable,
    private readonly prefix: string,
  ) {}

  static async connect(options: MysqlSourceOptions): Promise<MysqlPhpbbSource> {
    const prefix = options.tablePrefix ?? 'phpbb_'
    assertSafePrefix(prefix)
    return new MysqlPhpbbSource(await connectMysql(options), prefix)
  }

  async close(): Promise<void> {
    await this.connection.end()
  }

  async users(afterId: number, limit: number): Promise<Page<ImportedUser>> {
    return mapPage(
      await keysetPage<PhpbbUser>(
        this.connection,
        `select user_id, user_type, username, user_email, user_password,
                user_regdate, user_lastvisit, user_posts, group_id
           from \`${this.prefix}users\``,
        'user_id',
        (row) => row.user_id,
        afterId,
        limit,
      ),
      mapPhpbbUser,
    )
  }

  async forums(afterId: number, limit: number): Promise<Page<ImportedForum>> {
    return mapPage(
      await keysetPage<PhpbbForum>(
        this.connection,
        `select forum_id, parent_id, forum_name, forum_desc, forum_type, forum_link, left_id
           from \`${this.prefix}forums\``,
        'forum_id',
        (row) => row.forum_id,
        afterId,
        limit,
      ),
      mapPhpbbForum,
    )
  }

  async threads(afterId: number, limit: number): Promise<Page<ImportedThread>> {
    return mapPage(
      await keysetPage<PhpbbTopic>(
        this.connection,
        `select topic_id, forum_id, topic_title, topic_poster, topic_first_poster_name,
                topic_time, topic_last_post_time, topic_views, topic_posts_approved,
                topic_status, topic_type, topic_visibility, topic_moved_id
           from \`${this.prefix}topics\``,
        'topic_id',
        (row) => row.topic_id,
        afterId,
        limit,
      ),
      mapPhpbbTopic,
    )
  }

  async posts(afterId: number, limit: number): Promise<Page<ImportedPost>> {
    return mapPage(
      await keysetPage<PhpbbPost>(
        this.connection,
        `select post_id, topic_id, forum_id, poster_id, post_username, post_subject,
                post_text, bbcode_uid, post_time, post_edit_time, post_visibility
           from \`${this.prefix}posts\``,
        'post_id',
        (row) => row.post_id,
        afterId,
        limit,
      ),
      mapPhpbbPost,
    )
  }

  async avatars(afterId: number, limit: number): Promise<Page<ImportedAvatar>> {
    const rows = await selectRows<PhpbbAvatarRow>(
      this.connection,
      `select user_id, user_avatar, user_avatar_type, user_avatar_width, user_avatar_height
         from \`${this.prefix}users\`
        where user_id > ? and user_avatar <> ''
        order by user_id asc limit ?`,
      [afterId, limit],
    )
    const last = rows.at(-1)
    return mapPage(
      { rows, nextCursor: rows.length < limit || last === undefined ? null : last.user_id },
      mapPhpbbAvatar,
    )
  }

  async attachments(afterId: number, limit: number): Promise<Page<ImportedAttachment>> {
    const rows = await selectRows<PhpbbAttachment>(
      this.connection,
      `select attach_id, post_msg_id, poster_id, real_filename, physical_filename,
              mimetype, filesize, download_count, filetime, thumbnail
         from \`${this.prefix}attachments\`
        where attach_id > ? and in_message = 0
        order by attach_id asc limit ?`,
      [afterId, limit],
    )
    const last = rows.at(-1)
    return mapPage(
      { rows, nextCursor: rows.length < limit || last === undefined ? null : last.attach_id },
      mapPhpbbAttachment,
    )
  }

  async polls(afterId: number, limit: number): Promise<Page<ImportedPoll>> {
    const topics = await selectRows<PhpbbPollTopic>(
      this.connection,
      `select topic_id, poll_title, poll_start, poll_length
         from \`${this.prefix}topics\`
        where topic_id > ? and poll_title <> '' and topic_moved_id = 0
        order by topic_id asc limit ?`,
      [afterId, limit],
    )

    const last = topics.at(-1)
    const options =
      topics.length === 0
        ? []
        : await selectRows<PhpbbPollOption>(
            this.connection,
            `select topic_id, poll_option_id, poll_option_text, poll_option_total
               from \`${this.prefix}poll_options\`
              where topic_id in (${topics.map(() => '?').join(', ')})
              order by topic_id asc, poll_option_id asc`,
            topics.map((topic) => topic.topic_id),
          )

    return {
      rows: topics
        .map((topic) => mapPhpbbPoll(topic, options))
        .filter((poll): poll is NonNullable<typeof poll> => poll !== null),
      nextCursor: topics.length < limit || last === undefined ? null : last.topic_id,
    }
  }

  async pollVotes(afterId: number, limit: number): Promise<Page<ImportedPollVote>> {
    const table = `\`${this.prefix}poll_votes\``
    const page = await pageByGroup<PhpbbPollVote>({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.topic_id,
      fetch: (afterGroup, take) =>
        selectRows(
          this.connection,
          `select topic_id, poll_option_id, vote_user_id from ${table}
            where topic_id > ? order by topic_id asc, vote_user_id asc limit ?`,
          [afterGroup, take],
        ),
      fetchGroup: (group) =>
        selectRows(
          this.connection,
          `select topic_id, poll_option_id, vote_user_id from ${table}
            where topic_id = ? order by vote_user_id asc`,
          [group],
        ),
    })
    return mapPage(page, mapPhpbbPollVote)
  }

  async privateMessages(afterId: number, limit: number): Promise<Page<ImportedPrivateMessage>> {
    const messages = await selectRows<PhpbbPrivateMessage>(
      this.connection,
      `select msg_id, author_id, message_subject, message_text, bbcode_uid, message_time
         from \`${this.prefix}privmsgs\`
        where msg_id > ? order by msg_id asc limit ?`,
      [afterId, limit],
    )

    const last = messages.at(-1)
    const copies =
      messages.length === 0
        ? []
        : await selectRows<PhpbbPrivateMessageCopy>(
            this.connection,
            `select msg_id, user_id, author_id, folder_id, pm_deleted, pm_unread
               from \`${this.prefix}privmsgs_to\`
              where msg_id in (${messages.map(() => '?').join(', ')})
              order by msg_id asc, user_id asc`,
            messages.map((message) => message.msg_id),
          )

    return {
      rows: messages
        .map((message) => mapPhpbbPrivateMessage(message, copies))
        .filter((message): message is NonNullable<typeof message> => message !== null),
      nextCursor: messages.length < limit || last === undefined ? null : last.msg_id,
    }
  }

  threadSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return this.#watch(`\`${this.prefix}topics_watch\``, 'topic_id', afterId, limit)
  }

  forumSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return this.#watch(`\`${this.prefix}forums_watch\``, 'forum_id', afterId, limit)
  }

  reputation(): Promise<Page<ImportedReputation>> {
    return noPhpbbReputation()
  }

  async warnings(afterId: number, limit: number): Promise<Page<ImportedWarning>> {
    return mapPage(
      await keysetPage<PhpbbWarning>(
        this.connection,
        `select warning_id, user_id, post_id, warning_time
           from \`${this.prefix}warnings\``,
        'warning_id',
        (row) => row.warning_id,
        afterId,
        limit,
      ),
      mapPhpbbWarning,
    )
  }

  async bans(afterId: number, limit: number): Promise<Page<ImportedBan>> {
    return mapPage(
      await keysetPage<PhpbbBan>(
        this.connection,
        `select ban_id, ban_userid, ban_start, ban_end, ban_exclude,
                ban_reason, ban_give_reason
           from \`${this.prefix}banlist\``,
        'ban_id',
        (row) => row.ban_id,
        afterId,
        limit,
      ),
      mapPhpbbBan,
    )
  }

  async userRelations(afterId: number, limit: number): Promise<Page<ImportedUserRelation>> {
    const table = `\`${this.prefix}zebra\``
    const page = await pageByGroup<PhpbbZebra>({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.user_id,
      fetch: (afterGroup, take) =>
        selectRows(
          this.connection,
          `select user_id, zebra_id, friend, foe from ${table}
            where user_id > ? order by user_id asc, zebra_id asc limit ?`,
          [afterGroup, take],
        ),
      fetchGroup: (group) =>
        selectRows(
          this.connection,
          `select user_id, zebra_id, friend, foe from ${table}
            where user_id = ? order by zebra_id asc`,
          [group],
        ),
    })
    return mapPage(page, mapPhpbbZebra)
  }

  async #watch(
    table: string,
    targetColumn: 'topic_id' | 'forum_id',
    afterId: number,
    limit: number,
  ): Promise<Page<ImportedSubscription>> {
    const page = await pageByGroup<PhpbbWatch>({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.user_id,
      fetch: (afterGroup, take) =>
        selectRows(
          this.connection,
          `select user_id, ${targetColumn} as target_id from ${table}
            where user_id > ? order by user_id asc, ${targetColumn} asc limit ?`,
          [afterGroup, take],
        ),
      fetchGroup: (group) =>
        selectRows(
          this.connection,
          `select user_id, ${targetColumn} as target_id from ${table}
            where user_id = ? order by ${targetColumn} asc`,
          [group],
        ),
    })
    return mapPage(page, mapPhpbbWatch)
  }
}
