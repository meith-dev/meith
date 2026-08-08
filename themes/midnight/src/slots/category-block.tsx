import type { CategoryBlockModel } from '@meith/theme-kit'

/**
 * A category as a **table**, which is the whole shape difference from the
 * default theme's card of list items.
 *
 * The rows arrive as `children` — already rendered `CommunityRow` slots — so this
 * works only because midnight's `CommunityRow` returns a `<tr>`. That pairing is
 * exactly what a theme owns: the page composes regions and never sees either
 * element. A theme that overrode one and inherited the other would produce
 * invalid markup, which is why midnight overrides both.
 */
export function CategoryBlock({ category, children }: CategoryBlockModel) {
  return (
    <section className="border border-border">
      <h2 className="border-b border-border bg-secondary px-3 py-1.5 font-mono text-sm font-semibold uppercase tracking-wide">
        <a href={category.href} className="hover:text-primary">
          {category.title}
        </a>
      </h2>
      {category.description !== null && (
        <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
          {category.description}
        </p>
      )}
      <table className="w-full border-collapse text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Community</th>
            <th scope="col">Threads</th>
            <th scope="col">Posts</th>
            <th scope="col">Last post</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  )
}
