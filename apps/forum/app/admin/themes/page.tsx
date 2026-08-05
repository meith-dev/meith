import type { Metadata } from 'next'

import { LogoUploadForm } from '@/components/admin/branding-forms'
import { ThemeStateForms } from '@/components/admin/theme-forms'
import { requireAdmin } from '@/server/admin'
import { logoKey, logoSrc } from '@/server/branding'
import { MAX_IMAGE_BYTES } from '@/server/image-upload'
import { themeListing } from '@/server/theme-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Themes' }

/**
 * F68 — the theme list.
 *
 * This screen decides **which themes members may choose**, **which one they
 * start on**, and behind each row **what each one looks like**. All three are
 * runtime facts, stored in the `themes` table and read on every render.
 *
 * It said, until recently, that there could be no theme switcher at all,
 * because "a control that appeared to switch would either not work or would
 * cost every first paint a database read". The second half had quietly stopped
 * being true: 91 of the board's 92 routes were already dynamic, because the
 * shell resolves the viewer from a cookie. There was no static rendering left
 * to protect, and the switcher costs a cookie read.
 *
 * What is still the build's decision is which themes *exist* — a theme is code,
 * `forum.config.ts` is the registry the bundler reads (invariant 6), and a
 * serverless bundle contains only what was in it at build time. Installing one
 * is `pnpm add`, a line, redeploy. Choosing among the installed ones is this
 * screen and the control at the foot of every page.
 */
export default async function AdminThemesPage() {
  await requireAdmin()

  const themes = await themeListing()
  const [lightKey, darkKey] = await Promise.all([logoKey('light'), logoKey('dark')])
  const now = new Date()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold">Themes</h1>
        <p className="text-sm text-muted-foreground">
          Every theme this build contains. Turn one on and members can pick it
          from the appearance control at the foot of every page; the default is
          what a member who has picked nothing sees.
        </p>
      </div>

      {/*
        Branding above the theme list, because it is the thing an operator came
        here to change. A board's own mark belongs to the board rather than to
        any one theme — it does not move when a member picks a different look —
        so it sits outside the list rather than inside a row of it.
      */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-lg font-semibold">Logo</h2>
          <p className="text-sm text-muted-foreground">
            Shown in the header instead of the board&rsquo;s name. Two images,
            because one that reads on a white page usually disappears on a black
            one — upload only the light one and it is used in both. With none,
            the header shows the name, which is what it does today.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LogoUploadForm
            maxKib={MAX_IMAGE_BYTES / 1024}
            slot={{
              scheme: 'light',
              label: 'Light',
              hint: 'Used on a light page, and everywhere if there is no dark one.',
              src: lightKey === null ? null : logoSrc('light', lightKey),
            }}
          />
          <LogoUploadForm
            maxKib={MAX_IMAGE_BYTES / 1024}
            slot={{
              scheme: 'dark',
              label: 'Dark',
              hint: 'Used when the reader is in dark mode.',
              src: darkKey === null ? null : logoSrc('dark', darkKey),
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          What a screen reader announces in place of the logo is{' '}
          <strong>Logo alt text</strong> under Settings → Board. Left empty it
          becomes the board&rsquo;s name, which is usually what a logo says
          anyway.
        </p>
      </section>

      <h2 className="font-serif text-lg font-semibold">Installed themes</h2>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {themes.map((theme) => (
          <li key={theme.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{theme.title}</span>
                {theme.isDefault && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Default
                  </span>
                )}
                {!theme.enabled && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Off
                  </span>
                )}
                {theme.isBuildTheme && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    The build&rsquo;s own
                  </span>
                )}
              </span>

              <span className="truncate text-xs text-muted-foreground">
                <code className="text-xs">{theme.key}</code> ·{' '}
                {theme.overriddenTokens === 0 && !theme.hasCustomCss
                  ? 'no changes — exactly as it ships'
                  : `${theme.overriddenTokens} colour${theme.overriddenTokens === 1 ? '' : 's'} changed${
                      theme.hasCustomCss ? ', plus custom CSS' : ''
                    }`}
                {theme.updatedAt !== null && (
                  <>
                    {' '}
                    · changed{' '}
                    <time dateTime={theme.updatedAt.toISOString()}>
                      {formatTime(theme.updatedAt, now).label}
                    </time>
                  </>
                )}
              </span>
            </span>

            <ThemeStateForms
              themeKey={theme.key}
              enabled={theme.enabled}
              isDefault={theme.isDefault}
              isBuildTheme={theme.isBuildTheme}
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-semibold">What a member&rsquo;s choice changes</h2>
        <p className="text-muted-foreground">
          <strong>The whole theme</strong> — its components as well as its
          colours. A theme that renders forum listings as tables renders them as
          tables for the member who picked it. The choice is a cookie, resolved
          on the server, so the page arrives already correct: no flash, no
          second paint, and the control works with JavaScript turned off.
        </p>
        <p className="text-muted-foreground">
          A theme that ships <em>only</em> tokens is the exception, and is a
          deliberate one: it has no components to render, so picking it repaints
          the board and leaves the layout alone. That is how a board offers three
          looks without maintaining three sets of components.
        </p>
        <p className="text-muted-foreground">
          What is still a deploy is which themes <em>exist</em>. A theme is code,
          so it has to be in the build: <code className="text-xs">pnpm add</code>{' '}
          the package, add a line to{' '}
          <code className="text-xs">forum.config.ts</code>, redeploy.{' '}
          <code className="text-xs">defaultTheme</code> in that file decides
          which theme the board falls back to when its table says nothing —
          everything else is on this page.
        </p>
      </section>
    </div>
  )
}
