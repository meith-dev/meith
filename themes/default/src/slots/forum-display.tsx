import type { ForumDisplayModel } from "@forum/theme-kit";

/** Forum title plus regions composed by the route (F30). */
export function ForumDisplay({
  forum,
  newThreadHref,
  markReadAction,
  regions,
}: ForumDisplayModel) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{forum.title}</h1>
          {forum.description !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              {forum.description}
            </p>
          )}
        </div>
        <div className="flex gap-3 text-sm">
          {markReadAction !== null && (
            <form action={markReadAction} method="post">
              <button
                type="submit"
                className="text-muted-foreground hover:text-foreground"
              >
                Mark read
              </button>
            </form>
          )}
          {newThreadHref !== null && (
            <a
              href={newThreadHref}
              className="rounded-md bg-primary px-3 py-2 text-primary-foreground"
            >
              New thread
            </a>
          )}
        </div>
      </div>
      {regions.subforums}
      <ul className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
        {regions.threads}
      </ul>
      {regions.pagination}
    </div>
  );
}
