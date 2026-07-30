import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSlot } from "@forum/theme-kit";
import { getContainer } from "@/server/container";
import { getActor } from "@/server/context";
import { activeTheme } from "@/server/theme";
import { decodeForumCursor, encodeForumCursor } from "@/view/forum-cursor";
import { buildForumDisplayView } from "@/view/forum-display";

const THREADS_PER_PAGE = 25;

export const metadata: Metadata = { title: "Forum" };

function forumId(value: string): number | null {
  const match = /^(\d+)-/.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function ForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ after?: string; page?: string; posted?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const id = forumId(slug);
  const after = decodeForumCursor(query.after);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1)
    notFound();

  const actor = await getActor();
  const { forums, threads, authorizer, readState, threadWrites } = getContainer();
  const [rows, visible, read] = await Promise.all([
    forums.listListing(),
    authorizer.visibleForumIds(actor),
    actor.userId === null || readState === null
      ? Promise.resolve(null)
      : readState.forUser(actor.userId),
  ]);
  const forum = rows.find((row) => row.id === id);
  if (!forum || forum.type !== "forum" || !visible.includes(id)) notFound();
  const matrix = await authorizer.forumMatrix(actor, id);
  if (!authorizer.can(actor, "thread.view", { forumId: id, forum: matrix }))
    notFound();

  const threadPage = await threads.listForum(
    id,
    after === undefined
      ? { limit: THREADS_PER_PAGE }
      : { after, limit: THREADS_PER_PAGE },
  );
  const nextHref = threadPage.nextCursor
    ? `/forum/${id}-${forum.slug}?after=${encodeForumCursor(threadPage.nextCursor)}&page=${page + 1}`
    : null;
  /*
   * The composer link appears only when this actor may actually use it, and
   * only when the board can accept a post at all (fixture mode cannot). A link
   * to a page that 404s is worse than no link.
   */
  const canPost =
    threadWrites !== null &&
    forum.type === "forum" &&
    authorizer.can(actor, "thread.post", { forumId: id, forum: matrix });

  const view = buildForumDisplayView({
    forum,
    newThreadHref: canPost ? `/forum/${id}-${forum.slug}/new` : null,
    subforums: rows.filter(
      (row) => row.parentId === id && visible.includes(row.id),
    ),
    page: threadPage,
    pageNumber: page,
    nextHref,
    readState: read,
    markReadAction: read === null ? null : `/api/read/forum/${id}`,
    now: new Date(),
  });

  const ForumDisplay = requireSlot(activeTheme, "ForumDisplay");
  const Notice = requireSlot(activeTheme, "Notice");
  const ThreadRow = requireSlot(activeTheme, "ThreadRow");
  const SubforumList = requireSlot(activeTheme, "SubforumList");
  const Pagination = requireSlot(activeTheme, "Pagination");

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      {/*
        Where a held thread lands. The author cannot be sent to a thread nobody
        can see, so the forum tells them what happened; dismissal is the same
        link without the parameter, which needs no JavaScript and no state.
      */}
      {query.posted === "moderated" && (
        <div className="px-6 pt-6">
          <Notice
            kind="info"
            message="Your thread was posted and is waiting for a moderator to approve it."
            dismissHref={`/forum/${id}-${forum.slug}`}
          />
        </div>
      )}
      <ForumDisplay
        {...view.display}
        regions={{
          subforums:
            view.subforums === null ? null : (
              <SubforumList {...view.subforums} />
            ),
          threads: view.threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          )),
          pagination: <Pagination {...view.pagination} />,
        }}
      />
    </main>
  );
}
