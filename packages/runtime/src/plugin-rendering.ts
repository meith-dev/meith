import type { MarkdownPipeline } from '@meith/markdown'
import type { PluginHost } from '@meith/plugin-kit'

export function pluginMarkdownPipeline(host: PluginHost): MarkdownPipeline {
  return {
    text: (text, context) =>
      host.applyFilter('markdown.parse.text', text, {
        ...context.viewer,
        source: context.source,
      }),

    html: (html, context) =>
      host.applyFilter('markdown.render.html', html, {
        ...context.viewer,
        source: context.source,
      }),

    vocabulary: async (source) => ({
      revision: source.revision,
      directives: await host.applyFilter('markdown.directives', source.directives, {}),
      smilies: await host.applyFilter('smilies.list', source.smilies, {}),
    }),
  }
}
