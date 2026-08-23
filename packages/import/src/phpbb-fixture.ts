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
import type { PhpbbTables, PhpbbWatch } from './phpbb-rows'
import { groupRows, type ImportSource, type Page, pageByGroup, pageById } from './source'
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

function mapPage<Raw, Mapped>(page: Page<Raw>, map: (row: Raw) => Mapped | null): Page<Mapped> {
  return {
    rows: page.rows.map(map).filter((row): row is NonNullable<Mapped> => row !== null),
    nextCursor: page.nextCursor,
  }
}

export class FixturePhpbbSource implements ImportSource {
  readonly name = 'phpbb'

  constructor(private readonly data: PhpbbTables) {}

  users(afterId: number, limit: number): Promise<Page<ImportedUser>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.users ?? [], (row) => row.user_id, afterId, limit),
        mapPhpbbUser,
      ),
    )
  }

  forums(afterId: number, limit: number): Promise<Page<ImportedForum>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.forums ?? [], (row) => row.forum_id, afterId, limit),
        mapPhpbbForum,
      ),
    )
  }

  threads(afterId: number, limit: number): Promise<Page<ImportedThread>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.topics ?? [], (row) => row.topic_id, afterId, limit),
        mapPhpbbTopic,
      ),
    )
  }

  posts(afterId: number, limit: number): Promise<Page<ImportedPost>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.posts ?? [], (row) => row.post_id, afterId, limit),
        mapPhpbbPost,
      ),
    )
  }

  avatars(afterId: number, limit: number): Promise<Page<ImportedAvatar>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.avatars ?? [], (row) => row.user_id, afterId, limit),
        mapPhpbbAvatar,
      ),
    )
  }

  attachments(afterId: number, limit: number): Promise<Page<ImportedAttachment>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.attachments ?? [], (row) => row.attach_id, afterId, limit),
        mapPhpbbAttachment,
      ),
    )
  }

  polls(afterId: number, limit: number): Promise<Page<ImportedPoll>> {
    const page = pageById(this.data.pollTopics ?? [], (row) => row.topic_id, afterId, limit)
    return Promise.resolve({
      rows: page.rows
        .map((topic) => mapPhpbbPoll(topic, this.data.pollOptions ?? []))
        .filter((poll): poll is NonNullable<typeof poll> => poll !== null),
      nextCursor: page.nextCursor,
    })
  }

  async pollVotes(afterId: number, limit: number): Promise<Page<ImportedPollVote>> {
    const { fetch, fetchGroup } = groupRows(this.data.pollVotes ?? [], (row) => row.topic_id)
    const page = await pageByGroup({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.topic_id,
      fetch,
      fetchGroup,
    })
    return mapPage(page, mapPhpbbPollVote)
  }

  privateMessages(afterId: number, limit: number): Promise<Page<ImportedPrivateMessage>> {
    const page = pageById(this.data.privateMessages ?? [], (row) => row.msg_id, afterId, limit)
    return Promise.resolve({
      rows: page.rows
        .map((message) => mapPhpbbPrivateMessage(message, this.data.privateMessageCopies ?? []))
        .filter((message): message is NonNullable<typeof message> => message !== null),
      nextCursor: page.nextCursor,
    })
  }

  threadSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return this.#watch(this.data.topicWatch ?? [], afterId, limit)
  }

  forumSubscriptions(afterId: number, limit: number): Promise<Page<ImportedSubscription>> {
    return this.#watch(this.data.forumWatch ?? [], afterId, limit)
  }

  reputation(): Promise<Page<ImportedReputation>> {
    return noPhpbbReputation()
  }

  warnings(afterId: number, limit: number): Promise<Page<ImportedWarning>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.warnings ?? [], (row) => row.warning_id, afterId, limit),
        mapPhpbbWarning,
      ),
    )
  }

  bans(afterId: number, limit: number): Promise<Page<ImportedBan>> {
    return Promise.resolve(
      mapPage(
        pageById(this.data.bans ?? [], (row) => row.ban_id, afterId, limit),
        mapPhpbbBan,
      ),
    )
  }

  async userRelations(afterId: number, limit: number): Promise<Page<ImportedUserRelation>> {
    const { fetch, fetchGroup } = groupRows(this.data.zebra ?? [], (row) => row.user_id)
    const page = await pageByGroup({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.user_id,
      fetch,
      fetchGroup,
    })
    return mapPage(page, mapPhpbbZebra)
  }

  async #watch(
    rows: readonly PhpbbWatch[],
    afterId: number,
    limit: number,
  ): Promise<Page<ImportedSubscription>> {
    const { fetch, fetchGroup } = groupRows(rows, (row) => row.user_id)
    const page = await pageByGroup({
      afterGroup: afterId,
      limit,
      groupOf: (row) => row.user_id,
      fetch,
      fetchGroup,
    })
    return mapPage(page, mapPhpbbWatch)
  }
}
