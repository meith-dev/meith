import { expect } from '@playwright/test'

import { E2E_FAKE_MAIL_BASE_URL } from './config'

export interface DeliveredMail {
  readonly at: number
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string | null
}

export async function inbox(to: string): Promise<readonly DeliveredMail[]> {
  const response = await fetch(`${E2E_FAKE_MAIL_BASE_URL}/inbox?to=${encodeURIComponent(to)}`)
  if (!response.ok) throw new Error(`fake mail answered ${response.status}`)

  const body = (await response.json()) as { mail: DeliveredMail[] }
  return body.mail
}

export async function waitForMail(to: string, subjectPattern: RegExp): Promise<DeliveredMail> {
  let latest: DeliveredMail | undefined

  await expect
    .poll(
      async () => {
        latest = (await inbox(to)).find((mail) => subjectPattern.test(mail.subject))
        return latest === undefined ? 0 : 1
      },
      { message: `no mail to ${to} matching ${String(subjectPattern)}`, timeout: 15_000 },
    )
    .toBe(1)

  return latest as DeliveredMail
}

export function linkIn(mail: DeliveredMail, path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new RegExp(`https?://[^\\s"'<>]*${escaped}\\?token=[^\\s"'<>&]+`).exec(mail.text)

  if (found === null) {
    throw new Error(`no ${path} link in the mail to ${mail.to}:\n${mail.text}`)
  }
  return found[0]
}
