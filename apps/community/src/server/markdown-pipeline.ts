import 'server-only'

import type { MarkdownPipeline } from '@meith/markdown'

import { filterView } from './plugin-view'

export const boardRendering: MarkdownPipeline = {
  text: (text, context) =>
    filterView('markdown.parse.text', text, { ...context.viewer, source: context.source }),

  html: (html, context) =>
    filterView('markdown.render.html', html, { ...context.viewer, source: context.source }),

  vocabulary: async (source) => ({
    revision: source.revision,
    directives: await filterView('markdown.directives', source.directives, {}),
    smilies: await filterView('smilies.list', source.smilies, {}),
  }),
}
