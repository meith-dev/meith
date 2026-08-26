import 'server-only'

import type { OutgoingMail } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { drivers } from '@meith/drivers'

import { emitEvent, filterView } from './plugin-view'

export async function sendBoardMail(template: string, mail: OutgoingMail): Promise<boolean> {
  const proposed = await filterView(
    'mail.send.before',
    {
      to: mail.to,
      subject: mail.subject,
      textBody: mail.text,
      htmlBody: mail.html ?? null,
    },
    { template },
  )

  if (proposed === null) return false

  await drivers().mail.send({
    ...mail,
    to: proposed.to,
    subject: proposed.subject,
    text: proposed.textBody,
    ...(proposed.htmlBody === null ? {} : { html: proposed.htmlBody }),
  })

  await emitEvent(
    'mail.sent',
    { to: proposed.to, template },
    { requestId: currentRequestId() ?? null },
  )

  return true
}
