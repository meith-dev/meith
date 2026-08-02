import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@forum/theme-kit'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { activeTheme } from '@/server/theme'
import { userCpSections } from '@/view/usercp'

export const metadata: Metadata = { title: 'Your control panel' }

/**
 * F57 — the panel's index.
 *
 * The screen two finished features have been missing a home for: F55's
 * notification preferences and F56's subscriptions both work on their own URLs
 * and are linked from the user panel, but nothing tied them together as "the
 * things you can change about your account".
 *
 * Neither is *moved* here. Both keep their URLs, because both are linked from
 * elsewhere — an e-mail footer points at the preferences screen — and a member
 * who bookmarked one should not find it gone.
 */
export default async function UserCpPage() {
  const actor = await getActor()
  const { memberSettings } = getContainer()
  if (actor.userId === null || memberSettings === null) notFound()

  const sections = userCpSections()
  const Notice = requireSlot(activeTheme, 'Notice')

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Your control panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything about your account that you decide.
          </p>
        </div>

        <Notice
          kind="info"
          message="Your profile is public. Your options and e-mail address are not."
          dismissHref={null}
        />

        <ul className="flex flex-col gap-3">
          {sections.map((section) => (
            <li
              key={section.link.href}
              className="rounded-lg border border-border bg-card p-4"
            >
              <a
                href={section.link.href}
                className="text-sm font-medium text-primary hover:underline"
              >
                {section.title}
              </a>
              <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
