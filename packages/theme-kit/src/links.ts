import type { LinkModel } from './view-models'

export interface OffSiteAnchorProps {
  readonly target?: '_blank'
  readonly rel?: string
}

export function linkTarget(link: Pick<LinkModel, 'newTab'>): OffSiteAnchorProps {
  return link.newTab === true ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}
