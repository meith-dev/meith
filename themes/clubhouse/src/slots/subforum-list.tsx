import type { SubforumListModel } from '@meith/theme-kit'
import { Card, CardContent } from '@meith/ui'

import { HEADING, LINK, MICRO, NUMERIC, PanelHead } from '../shared'

export function SubforumList({ forums }: SubforumListModel) {
  if (forums.length === 0) return null

  return (
    <Card aria-labelledby="subforums-heading">
      <PanelHead id="subforums-heading" title="Subforums" />

      <CardContent className="px-4 py-3">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {forums.map((forum) => (
            <li key={forum.id} className="min-w-0">
              <a href={forum.href} className={`${HEADING} text-sm text-foreground ${LINK}`}>
                {forum.title}
              </a>
              {forum.type !== 'link' && (
                <p className={`${MICRO} ${NUMERIC} mt-0.5`}>
                  {forum.threadCount.toLocaleString('en')} threads ·{' '}
                  {forum.postCount.toLocaleString('en')} posts
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
