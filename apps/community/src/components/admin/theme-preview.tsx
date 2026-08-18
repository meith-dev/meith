'use client'

import { useId, useState } from 'react'

import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

export const PREVIEW_SCENES = [
  {
    key: 'forums',
    titleKey: 'adminTheme.preview.scene.forums.title',
    blurbKey: 'adminTheme.preview.scene.forums.blurb',
  },
  {
    key: 'thread',
    titleKey: 'adminTheme.preview.scene.thread.title',
    blurbKey: 'adminTheme.preview.scene.thread.blurb',
  },
  {
    key: 'controls',
    titleKey: 'adminTheme.preview.scene.controls.title',
    blurbKey: 'adminTheme.preview.scene.controls.blurb',
  },
] as const

export type PreviewScene = (typeof PREVIEW_SCENES)[number]['key']

const CHIP =
  'inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function ForumsScene({ copy }: { copy: Copy }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        data-token="surface"
        className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2"
      >
        <span className="font-heading text-sm font-semibold">
          {fromCopy(copy, 'adminTheme.sample.boardName')}
        </span>
        <span data-token="muted-foreground" className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminTheme.sample.signedInAs')}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border shadow-elevation">
        <p data-token="surface" className="bg-surface px-3 py-2 text-xs font-medium">
          {fromCopy(copy, 'adminTheme.sample.category')}
        </p>

        <div
          data-token="card"
          className="flex flex-col divide-y divide-border bg-card text-card-foreground"
        >
          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-unread" className="text-sm font-semibold text-forum-unread">
                {fromCopy(copy, 'adminTheme.sample.announcements')}
              </span>
              <span className="text-xs text-muted-foreground">
                {copy['adminTheme.sample.lastPostAdminLead']}
                <span data-token="group-admin" className="font-medium text-group-admin">
                  ada
                </span>
                {copy['adminTheme.sample.lastPostAdminTail']}
              </span>
            </span>
            <span data-token="muted-foreground" className="shrink-0 text-xs text-muted-foreground">
              {formatFromCopy(copy, 'adminTheme.sample.threadCount', { count: 128 })}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-read" className="text-sm font-semibold text-forum-read">
                {fromCopy(copy, 'adminTheme.sample.introductions')}
              </span>
              <span className="text-xs text-muted-foreground">
                {copy['adminTheme.sample.lastPostModLead']}
                <span data-token="group-mod" className="font-medium text-group-mod">
                  grace
                </span>
                {copy['adminTheme.sample.lastPostModTail']}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatFromCopy(copy, 'adminTheme.sample.threadCount', { count: 1204 })}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-3 p-3">
            <span className="flex min-w-0 flex-col">
              <span data-token="forum-locked" className="text-sm font-semibold text-forum-locked">
                {fromCopy(copy, 'adminTheme.sample.archive')}
              </span>
              <span className="text-xs text-muted-foreground">
                {fromCopy(copy, 'adminTheme.sample.closedToNewPosts')}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatFromCopy(copy, 'adminTheme.sample.threadCount', { count: 96 })}
            </span>
          </div>
        </div>
      </div>

      <div
        data-token="card"
        className="flex flex-wrap items-center gap-2 rounded-md bg-card p-3 text-xs shadow-elevation"
      >
        <span data-token="thread-pinned" className="font-medium text-thread-pinned">
          {fromCopy(copy, 'adminTheme.sample.pinnedThread')}
        </span>
        <span className="text-muted-foreground">·</span>
        <span data-token="thread-locked" className="font-medium text-thread-locked">
          {fromCopy(copy, 'adminTheme.sample.lockedThread')}
        </span>
        <span className="text-muted-foreground">·</span>
        <span data-token="thread-moved" className="font-medium text-thread-moved">
          {fromCopy(copy, 'adminTheme.sample.movedThread')}
        </span>
      </div>
    </div>
  )
}

function ThreadScene({ copy }: { copy: Copy }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-token="muted-foreground" className="text-xs text-muted-foreground">
        {copy['adminTheme.sample.breadcrumbLead']}
        <span data-token="foreground" className="text-foreground">
          {fromCopy(copy, 'adminTheme.sample.threadTitle')}
        </span>
        {copy['adminTheme.sample.breadcrumbTail']}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-heading text-base font-semibold">
          {fromCopy(copy, 'adminTheme.sample.threadTitle')}
        </h4>
        <span
          data-token="thread-pinned"
          className="rounded-full border border-border px-2 py-0.5 text-xs text-thread-pinned"
        >
          {fromCopy(copy, 'adminTheme.sample.pinned')}
        </span>
        <span
          data-token="thread-unapproved"
          className="rounded-full border border-border px-2 py-0.5 text-xs text-thread-unapproved"
        >
          {fromCopy(copy, 'adminTheme.sample.awaitingApproval')}
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
            {fromCopy(copy, 'adminTheme.sample.supermodMeta')}
          </span>
        </p>
        <p data-token="card-foreground" className="mt-2 text-sm">
          {fromCopy(copy, 'adminTheme.sample.permalinkNote')}
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
          <span className="text-muted-foreground">
            {fromCopy(copy, 'adminTheme.sample.adminMeta')}
          </span>
        </p>
        <p className="mt-2 text-sm">
          {copy['adminTheme.sample.ownPostLead']}
          <a
            data-token="primary"
            href="#preview"
            className="font-medium underline underline-offset-2"
          >
            {fromCopy(copy, 'adminTheme.sample.ordinaryLink')}
          </a>
          {copy['adminTheme.sample.ownPostTail']}
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
          <span className="text-muted-foreground">
            {fromCopy(copy, 'adminTheme.sample.bannedMeta')}
          </span>
        </p>
        <p className="mt-2">{fromCopy(copy, 'adminTheme.sample.heldPost')}</p>
      </article>
    </div>
  )
}

function ControlsScene({ copy }: { copy: Copy }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-token="primary"
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          <span data-token="primary-foreground">
            {fromCopy(copy, 'adminTheme.sample.postReply')}
          </span>
        </span>
        <span
          data-token="primary-hover"
          className="inline-flex h-9 items-center rounded-md bg-primary-hover px-3 text-sm font-medium text-primary-foreground"
        >
          {fromCopy(copy, 'adminTheme.sample.hovered')}
        </span>
        <span
          data-token="secondary"
          className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
        >
          <span data-token="secondary-foreground">
            {fromCopy(copy, 'adminTheme.sample.previewButton')}
          </span>
        </span>
        <span
          data-token="destructive"
          className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground"
        >
          <span data-token="destructive-foreground">
            {fromCopy(copy, 'adminTheme.sample.delete')}
          </span>
        </span>
      </div>

      <div
        data-token="card"
        className="flex flex-col gap-1 rounded-md bg-card p-3 shadow-elevation"
      >
        <span className="text-xs font-medium">
          {fromCopy(copy, 'adminTheme.sample.threadTitleLabel')}
        </span>
        <span data-token="ring" className="rounded-md outline-2 outline-offset-2 outline-ring">
          <span
            data-token="input"
            className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs"
          >
            {fromCopy(copy, 'adminTheme.sample.threadTitle')}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminTheme.sample.fieldNote')}
        </span>
      </div>

      <div
        data-token="accent"
        className="flex flex-wrap items-center gap-2 rounded-md bg-accent p-3 text-xs text-accent-foreground"
      >
        <span data-token="accent-foreground">{fromCopy(copy, 'adminTheme.sample.hoveredRow')}</span>
      </div>

      <div
        data-token="card"
        className="flex flex-col gap-2 rounded-md bg-card p-3 text-xs shadow-elevation"
      >
        <span className="font-medium">{fromCopy(copy, 'adminTheme.sample.moderationQueue')}</span>
        <span className="flex flex-wrap gap-3">
          <span data-token="moderation-pending" className="font-medium text-moderation-pending">
            {fromCopy(copy, 'adminTheme.sample.queueWaiting')}
          </span>
          <span data-token="moderation-approved" className="font-medium text-moderation-approved">
            {fromCopy(copy, 'adminTheme.sample.queueApproved')}
          </span>
          <span data-token="moderation-rejected" className="font-medium text-moderation-rejected">
            {fromCopy(copy, 'adminTheme.sample.queueRejected')}
          </span>
          <span data-token="thread-deleted" className="font-medium text-thread-deleted">
            {fromCopy(copy, 'adminTheme.sample.queueDeleted')}
          </span>
        </span>
      </div>
    </div>
  )
}

function Scene({ scene, copy }: { scene: PreviewScene; copy: Copy }) {
  if (scene === 'forums') return <ForumsScene copy={copy} />
  if (scene === 'thread') return <ThreadScene copy={copy} />
  return <ControlsScene copy={copy} />
}

function SampleFrame({
  palette,
  dark,
  label,
  scene,
  copy,
  onPick,
}: {
  palette: React.CSSProperties
  dark?: boolean
  label: string
  scene: PreviewScene
  copy: Copy
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
        <Scene scene={scene} copy={copy} />
      </div>
    </div>
  )
}

export function ThemePreview({
  copy,
  light,
  dark,
  hydrated,
  onPick,
}: {
  copy: Copy
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
        <h3 className="text-base font-semibold tracking-tight">
          {fromCopy(copy, 'adminTheme.preview.title')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminTheme.preview.blurb')}
        </p>
        {hydrated && onPick !== undefined && (
          <p className="text-xs text-muted-foreground">
            {copy['adminTheme.preview.clickNoteLead']}
            <strong className="font-medium text-foreground">
              {fromCopy(copy, 'adminTheme.preview.clickNoteStrong')}
            </strong>
            {copy['adminTheme.preview.clickNoteTail']}
          </p>
        )}
      </div>

      {hydrated && (
        <div
          role="group"
          aria-label={fromCopy(copy, 'adminTheme.preview.sceneGroup')}
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
              {fromCopy(copy, entry.titleKey)}
            </button>
          ))}
        </div>
      )}

      {shown.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" id={`${groupId}-${entry.key}`}>
            {fromCopy(copy, entry.blurbKey)}
          </p>
          <div className="flex flex-col gap-3">
            <SampleFrame
              label={fromCopy(copy, 'adminTheme.scheme.light')}
              palette={light}
              scene={entry.key}
              copy={copy}
              onPick={onPick}
            />
            <SampleFrame
              label={fromCopy(copy, 'adminTheme.scheme.dark')}
              palette={dark}
              scene={entry.key}
              copy={copy}
              dark
              onPick={onPick}
            />
          </div>
        </div>
      ))}
    </section>
  )
}

export function ValidatedSample({ scene = 'forums', copy }: { scene?: PreviewScene; copy: Copy }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SampleFrame
        label={fromCopy(copy, 'adminTheme.scheme.light')}
        palette={{}}
        scene={scene}
        copy={copy}
      />
      <SampleFrame
        label={fromCopy(copy, 'adminTheme.scheme.dark')}
        palette={{}}
        scene={scene}
        copy={copy}
        dark
      />
    </div>
  )
}
