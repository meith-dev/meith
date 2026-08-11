import type { AnnouncementModel } from '@meith/theme-kit'

import { Circle, MUTED_LINK, PANEL, Stamp, Tag, UserRef } from '../shared'

export function Announcement({ title, bodyHtml, postedBy, postedAt, forum }: AnnouncementModel) {
  return (
    <article className={`${PANEL} border-l-4 border-l-primary`}>
      <div className="flex items-start gap-3 px-4 pt-3">
        <Circle name={postedBy?.username ?? title} size={40} />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {postedBy !== null && <UserRef user={postedBy} className="text-sm" />}
            <span className="text-xs text-muted-foreground">
              <Stamp at={postedAt} />
            </span>
            <Tag>Announcement</Tag>
          </p>

          <h2 className="mt-1 text-base leading-snug font-bold text-balance">{title}</h2>

          {forum !== null && (
            <p className="mt-0.5 text-xs">
              <a href={forum.href} className={MUTED_LINK}>
                #{forum.label}
              </a>
            </p>
          )}
        </div>
      </div>

      <div
        className="prose-md px-4 pt-2 pb-4 text-[0.9375rem]"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </article>
  )
}
