import type { SubforumListModel } from "@meith/theme-kit";

export function SubforumList({ forums }: SubforumListModel) {
  return (
    <section
      aria-labelledby="subforums-heading"
      className="rounded-lg border border-border bg-card px-4 py-3"
    >
      <h2 id="subforums-heading" className="text-sm font-semibold">
        Subforums
      </h2>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {forums.map((forum) => (
          <li key={forum.id}>
            <a href={forum.href} className="hover:text-primary">
              {forum.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
