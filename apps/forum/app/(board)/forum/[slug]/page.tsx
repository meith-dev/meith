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
  searchParams: Promise<{ after?: string; page?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const id = forumId(slug);
  const after = decodeForumCursor(query.after);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (id === null || after === null || !Number.isSafeInteger(page) || page < 1)
    notFound();

  const actor = await getActor();
  const { forums, threads, authorizer, readState } = getContainer();
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
  const view = buildForumDisplayView({
    forum,
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
  const ThreadRow = requireSlot(activeTheme, "ThreadRow");
  const SubforumList = requireSlot(activeTheme, "SubforumList");
  const Pagination = requireSlot(activeTheme, "Pagination");

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
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
