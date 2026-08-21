import 'server-only'

import type { MarkdownPipeline } from '@meith/markdown'

import { resolveInlineAttachments } from './attachment-embed'
import { highlightCodeBlocks } from './code-highlighting'
import { unfurlEmbeds } from './embeds'
import { filterView } from './plugin-view'

export const boardRendering: MarkdownPipeline = {
  text: (text, context) =>
    filterView('markdown.parse.text', text, { ...context.viewer, source: context.source }),

  html: async (html, context) => {
    const withAttachments = await resolveInlineAttachments(html, {
      viewerUserId: context.viewer.userId,
      postId: context.postId ?? null,
    })
    const withEmbeds = await unfurlEmbeds(await highlightCodeBlocks(withAttachments))
    return filterView('markdown.render.html', withEmbeds, {
      ...context.viewer,
      source: context.source,
    })
  },

  vocabulary: async (source) => ({
    revision: source.revision,
    directives: await filterView('markdown.directives', source.directives, {}),
    smilies: await filterView('smilies.list', source.smilies, {}),
  }),
}
