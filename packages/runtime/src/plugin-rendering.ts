import type { MailDriver, OutgoingMail } from '@meith/core'
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

export async function sendAudited(
  host: PluginHost,
  mail: MailDriver,
  template: string,
  outgoing: OutgoingMail,
): Promise<void> {
  const proposed = await host.applyFilter(
    'mail.send.before',
    {
      to: outgoing.to,
      subject: outgoing.subject,
      textBody: outgoing.text,
      htmlBody: outgoing.html ?? null,
    },
    { template },
  )

  if (proposed === null) return

  await mail.send({
    ...outgoing,
    to: proposed.to,
    subject: proposed.subject,
    text: proposed.textBody,
    ...(proposed.htmlBody === null ? {} : { html: proposed.htmlBody }),
  })

  await host.emit('mail.sent', { to: proposed.to, template }, { requestId: null })
}
