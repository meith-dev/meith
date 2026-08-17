'use client'

import { useId, useState } from 'react'

export const PREVIEW_SCENES = [
  {
    key: 'forums',
    title: 'Forum list',
    blurb: 'Categories, forum rows and their read state — the board’s front page.',
  },
  {
    key: 'thread',
    title: 'A thread',
    blurb: 'Posts, member names by group, and the tints behind a highlighted or held post.',
  },
  {
    key: 'controls',
    title: 'Controls',
    blurb: 'Buttons, fields, badges and the moderation queue’s three states.',
  },
] as const

export type PreviewScene = (typeof PREVIEW_SCENES)[number]['key']

const CHIP =
  'inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function ForumsScene() {
  return (
    <div className="flex flex-col gap-3">
      <div
        data-token="surface"
        className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2"
      >
        <span className="font-heading text-sm font-semibold">Kestrel Board</span>
        <span data-token="muted-foreground" className="text-xs text-muted-foreground">
          Signed in as ada
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border shadow-elevation">
        <p data-token="surface" className="bg-surface px-3 py-2 text-xs font-medium">
          General discussion
        </p>

        <div
          data-token="card"
          className="flex flex-col divide-y divide-border bg-card text-card-foreground"
        >
          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-unread" className="text-sm font-semibold text-forum-unread">
                Announcements
              </span>
              <span className="text-xs text-muted-foreground">
                Last post by{' '}
                <span data-token="group-admin" className="font-medium text-group-admin">
                  ada
                </span>
                , an hour ago
              </span>
            </span>
            <span data-token="muted-foreground" className="shrink-0 text-xs text-muted-foreground">
              128 threads
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-read" className="text-sm font-semibold text-forum-read">
                Introductions
              </span>
              <span className="text-xs text-muted-foreground">
                Last post by{' '}
                <span data-token="group-mod" className="font-medium text-group-mod">
                  grace
                </span>
                , yesterday
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">1,204 threads</span>
          </div>

          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-locked" className="text-sm font-semibold text-forum-locked">
                The archive
              </span>
              <span className="text-xs text-muted-foreground">Closed to new posts</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">96 threads</span>
          </div>
        </div>
      </div>

      <div
        data-token="card"
        className="flex flex-wrap items-center gap-2 rounded-md bg-card p-3 text-xs shadow-elevation"
      >
        <span data-token="thread-pinned" className="font-medium text-thread-pinned">
          Read this first
        </span>
        <span className="text-muted-foreground">·</span>
        <span data-token="thread-locked" className="font-medium text-thread-locked">
          Closed: the old rules thread
        </span>
        <span className="text-muted-foreground">·</span>
        <span data-token="thread-moved" className="font-medium text-thread-moved">
          Moved to Off-topic
        </span>
      </div>
    </div>
  )
}

function ThreadScene() {
  return (
    <div className="flex flex-col gap-3">
      <p data-token="muted-foreground" className="text-xs text-muted-foreground">
        Kestrel Board → General discussion →{' '}
        <span data-token="foreground" className="text-foreground">
          Where should the pier go?
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-heading text-base font-semibold">Where should the pier go?</h4>
        <span
          data-token="thread-pinned"
          className="rounded-full border border-border px-2 py-0.5 text-xs text-thread-pinned"
        >
          Pinned
        </span>
        <span
          data-token="thread-unapproved"
          className="rounded-full border border-border px-2 py-0.5 text-xs text-thread-unapproved"
        >
          Awaiting approval
        </span>
      </div>

      <article
        data-token="post-highlight"
        className="rounded-md bg-post-highlight p-3 shadow-elevation"
      >
        <p className="flex flex-wrap items-baseline gap-2 text-xs">
          <span data-token="group-supermod" className="font-semibold text-group-supermod">
            grace
          </span>
          <span data-token="muted-foreground" className="text-muted-foreground">
            Super moderator · 2,048 posts · today
          </span>
        </p>
        <p data-token="card-foreground" className="mt-2 text-sm">
          The permalink you followed lands on this post, so it is tinted. Quoted code keeps the
          board’s monospace face:
        </p>
        <p data-token="muted" className="mt-2 rounded-md bg-muted px-2 py-1 font-mono text-xs">
          pnpm meith upgrade
        </p>
      </article>

      <article data-token="post-own" className="rounded-md bg-post-own p-3 shadow-elevation">
        <p className="flex flex-wrap items-baseline gap-2 text-xs">
          <span data-token="group-admin" className="font-semibold text-group-admin">
            ada
          </span>
          <span className="text-muted-foreground">Administrator · 5,391 posts · a moment ago</span>
        </p>
        <p className="mt-2 text-sm">
          Your own posts carry a gentle tint so you can find yourself in a long thread. An{' '}
          <a
            data-token="primary"
            href="#preview"
            className="font-medium underline underline-offset-2"
          >
            ordinary link
          </a>{' '}
          sits in the flow of a sentence.
        </p>
      </article>

      <article
        data-token="post-unapproved"
        className="rounded-md bg-post-unapproved p-3 text-sm shadow-elevation"
      >
        <p className="flex flex-wrap items-baseline gap-2 text-xs">
          <span data-token="group-banned" className="font-semibold text-group-banned">
            wren
          </span>
          <span className="text-muted-foreground">Banned · held for a moderator</span>
        </p>
        <p className="mt-2">A post the spam controls are holding, visible to staff.</p>
      </article>
    </div>
  )
}

function ControlsScene() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-token="primary"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          <span data-token="primary-foreground">Post reply</span>
        </span>
        <span
          data-token="primary-hover"
          className="inline-flex h-9 items-center rounded-md bg-primary-hover px-3 text-sm font-medium text-primary-foreground"
        >
          Hovered
        </span>
        <span
          data-token="secondary"
          className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
        >
          <span data-token="secondary-foreground">Preview</span>
        </span>
        <span
          data-token="destructive"
          className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground"
        >
          <span data-token="destructive-foreground">Delete</span>
        </span>
      </div>

      <div
        data-token="card"
        className="flex flex-col gap-1 rounded-md bg-card p-3 shadow-elevation"
      >
        <span className="text-xs font-medium">Thread title</span>
        <span data-token="ring" className="rounded-md outline-2 outline-offset-2 outline-ring">
          <span
            data-token="input"
            className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs"
          >
            Where should the pier go?
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          A field’s edge is darker than a rule, and the outline is what focus looks like.
        </span>
      </div>

      <div
        data-token="accent"
        className="flex flex-wrap items-center gap-2 rounded-md bg-accent p-3 text-xs text-accent-foreground"
      >
        <span data-token="accent-foreground">
          A hovered row or menu item, with the text that sits on it.
        </span>
      </div>

      <div
        data-token="card"
        className="flex flex-col gap-2 rounded-md bg-card p-3 text-xs shadow-elevation"
      >
        <span className="font-medium">Moderation queue</span>
        <span className="flex flex-wrap gap-3">
          <span data-token="moderation-pending" className="font-medium text-moderation-pending">
            3 waiting
          </span>
          <span data-token="moderation-approved" className="font-medium text-moderation-approved">
            18 approved
          </span>
          <span data-token="moderation-rejected" className="font-medium text-moderation-rejected">
            2 rejected
          </span>
          <span data-token="thread-deleted" className="font-medium text-thread-deleted">
            1 deleted
          </span>
        </span>
      </div>
    </div>
  )
}

function Scene({ scene }: { scene: PreviewScene }) {
  if (scene === 'forums') return <ForumsScene />
  if (scene === 'thread') return <ThreadScene />
  return <ControlsScene />
}

function SampleFrame({
  palette,
  dark,
  label,
  scene,
  onPick,
}: {
  palette: React.CSSProperties
  dark?: boolean
  label: string
  scene: PreviewScene
  onPick?: ((token: string) => void) | undefined
}) {
  const pick = (event: React.MouseEvent<HTMLElement>): void => {
    if (onPick === undefined) return
    const tagged = (event.target as HTMLElement).closest<HTMLElement>('[data-token]')
    const token = tagged?.dataset.token
    if (token === undefined || token === '') return
    event.preventDefault()
    onPick(token)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        data-theme-preview
        style={palette}
        onClick={onPick === undefined ? undefined : pick}
        className={`flex flex-col gap-3 rounded-lg border border-border bg-background p-3 text-foreground ${
          dark === true ? 'dark' : ''
        } ${
          onPick === undefined
            ? ''
            : '[&_[data-token]]:cursor-pointer [&_[data-token]:hover]:outline-2 [&_[data-token]:hover]:outline-offset-2 [&_[data-token]:hover]:outline-ring'
        }`}
      >
        <Scene scene={scene} />
      </div>
    </div>
  )
}

export function ThemePreview({
  light,
  dark,
  hydrated,
  onPick,
}: {
  light: React.CSSProperties
  dark: React.CSSProperties
  hydrated: boolean
  onPick?: ((token: string) => void) | undefined
}) {
  const [scene, setScene] = useState<PreviewScene>('forums')
  const groupId = useId()

  const shown = hydrated ? PREVIEW_SCENES.filter((entry) => entry.key === scene) : PREVIEW_SCENES

  return (
    <section className="flex flex-col gap-3" id="preview">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">Live sample</h3>
        <p className="text-xs text-muted-foreground">
          Painted from the form as you type — nothing here has been saved. Both schemes are shown
          because they are one decision: a colour that works on white often disappears on black.
          Custom CSS is not painted here; “Preview without saving” includes it.
        </p>
        {hydrated && onPick !== undefined && (
          <p className="text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">Click anything in the sample</strong> to
            open the token that paints it — the swatches beside it do the same thing from the
            keyboard.
          </p>
        )}
      </div>

      {hydrated && (
        <div
          role="group"
          aria-label="Which part of the board to sample"
          className="flex flex-wrap gap-2"
        >
          {PREVIEW_SCENES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={scene === entry.key}
              onClick={() => setScene(entry.key)}
              className={`${CHIP} ${
                scene === entry.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {entry.title}
            </button>
          ))}
        </div>
      )}

      {shown.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" id={`${groupId}-${entry.key}`}>
            {entry.blurb}
          </p>
          <div className="flex flex-col gap-3">
            <SampleFrame label="Light" palette={light} scene={entry.key} onPick={onPick} />
            <SampleFrame label="Dark" palette={dark} scene={entry.key} dark onPick={onPick} />
          </div>
        </div>
      ))}
    </section>
  )
}

export function ValidatedSample({ scene = 'forums' }: { scene?: PreviewScene }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SampleFrame label="Light" palette={{}} scene={scene} />
      <SampleFrame label="Dark" palette={{}} scene={scene} dark />
    </div>
  )
}
