import type { PostBitSlotModel } from '@forum/theme-kit'

export function PostBit({ post, regions }: PostBitSlotModel) {
  return (
    <article id={`post-${post.id}`} className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2 text-xs text-muted-foreground">
        {post.author.profileHref === null ? <span>{post.author.username}</span> : <a href={post.author.profileHref} className="hover:text-foreground">{post.author.username}</a>}
        <a href={post.permalink} className="hover:text-foreground">
          <time dateTime={post.postedAt.iso}>{post.postedAt.label}</time> #{post.number}
        </a>
      </header>
      <div className="px-4 py-4">
        <div className="whitespace-normal break-words" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      </div>
      {regions.actions !== null && <footer className="border-t border-border px-4 py-2">{regions.actions}</footer>}
    </article>
  )
}
