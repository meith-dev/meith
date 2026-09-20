import type { CSSProperties } from 'react'

import {
  DARK_TOKENS as CLUBHOUSE_DARK,
  LIGHT_TOKENS as CLUBHOUSE_LIGHT,
  clubhouseMessages,
  clubhouseTheme,
} from '@meith/theme-clubhouse'
import {
  DARK_TOKENS as DEFAULT_DARK,
  LIGHT_TOKENS as DEFAULT_LIGHT,
  defaultMessages,
  defaultTheme,
} from '@meith/theme-default'
import type { ForumRowModel } from '@meith/theme-kit'
import {
  DARK_TOKENS as MIDNIGHT_DARK,
  LIGHT_TOKENS as MIDNIGHT_LIGHT,
  midnightMessages,
  midnightTheme,
} from '@meith/theme-midnight'
import {
  DARK_TOKENS as PHASEBOOK_DARK,
  LIGHT_TOKENS as PHASEBOOK_LIGHT,
  phasebookMessages,
  phasebookTheme,
} from '@meith/theme-phasebook'
import {
  DARK_TOKENS as RAIDFRAME_DARK,
  LIGHT_TOKENS as RAIDFRAME_LIGHT,
  raidframeMessages,
  raidframeTheme,
} from '@meith/theme-raidframe'

import { site } from '../content/site'
import { PreviewScheme } from './preview-scheme'

const previews = [
  {
    key: 'default',
    title: 'Default',
    Category: defaultTheme.slots.CategoryBlock!,
    Forum: defaultTheme.slots.ForumRow!,
    copy: defaultMessages.en!,
    light: DEFAULT_LIGHT,
    dark: DEFAULT_DARK,
  },
  {
    key: 'clubhouse',
    title: 'Clubhouse',
    Category: clubhouseTheme.slots.CategoryBlock!,
    Forum: clubhouseTheme.slots.ForumRow!,
    copy: clubhouseMessages.en!,
    light: CLUBHOUSE_LIGHT,
    dark: CLUBHOUSE_DARK,
  },
  {
    key: 'phasebook',
    title: 'Phasebook',
    Category: phasebookTheme.slots.CategoryBlock!,
    Forum: phasebookTheme.slots.ForumRow!,
    copy: phasebookMessages.en!,
    light: PHASEBOOK_LIGHT,
    dark: PHASEBOOK_DARK,
  },
  {
    key: 'raidframe',
    title: 'Raidframe',
    Category: raidframeTheme.slots.CategoryBlock!,
    Forum: raidframeTheme.slots.ForumRow!,
    copy: raidframeMessages.en!,
    light: RAIDFRAME_LIGHT,
    dark: RAIDFRAME_DARK,
  },
  {
    key: 'midnight',
    title: 'Midnight',
    Category: midnightTheme.slots.CategoryBlock!,
    Forum: midnightTheme.slots.ForumRow!,
    copy: midnightMessages.en!,
    light: MIDNIGHT_LIGHT,
    dark: MIDNIGHT_DARK,
  },
] as const

const forums: readonly ForumRowModel[] = [
  {
    title: 'Start here',
    description: 'New faces, introductions and a few useful things to know.',
    threads: 24,
    posts: 108,
    latest: 'What brought you here?',
    author: 'aoife',
    time: '09:42',
  },
  {
    title: 'General discussions',
    description: 'Good questions, considered answers and room to think.',
    threads: 86,
    posts: 412,
    latest: 'What are you working on?',
    author: 'sam',
    time: '09:16',
  },
].map((forum, index) => ({
  id: index + 1,
  title: forum.title,
  description: forum.description,
  href: site.demo,
  type: 'forum',
  threadCount: { value: forum.threads, label: String(forum.threads) },
  postCount: { value: forum.posts, label: String(forum.posts) },
  lastPost: {
    threadTitle: forum.latest,
    href: site.demo,
    author: { userId: null, username: forum.author, profileHref: null },
    at: { iso: `2026-09-20T${forum.time}:00Z`, label: forum.time },
  },
  isUnread: false,
  subforums: [],
}))

export function ThemeShowcase() {
  return (
    <div className="board-preview" id="board-preview">
      <div className="board-preview-controls">
        <fieldset>
          <legend className="sr-only">Preview theme</legend>
          {previews.map((preview, index) => (
            <label className="edition-choice" key={preview.key}>
              <input
                name="preview-theme"
                type="radio"
                value={preview.key}
                defaultChecked={index === 0}
                aria-controls={`board-${preview.key}`}
              />
              {preview.title}
            </label>
          ))}
        </fieldset>
        <PreviewScheme />
      </div>
      {previews.map(({ key, title, Category, Forum, copy, light, dark }, index) => (
        <div className="board-preview-panel" data-board-theme={key} id={`board-${key}`} key={key}>
          <style>
            {(['light', 'dark'] as const)
              .map(
                (scheme) =>
                  `#board-preview:has(input[name="preview-scheme"][value="${scheme}"]:checked) #board-${key}{${Object.entries(
                    scheme === 'light' ? light : dark,
                  )
                    .map(([token, value]) => `--${token}:${value};`)
                    .join('')}}`,
              )
              .join('\n')}
          </style>
          <div
            className="board-preview-content"
            style={
              {
                '--radius-sm': 'calc(var(--radius) * 0.5)',
                '--radius-md': 'calc(var(--radius) * 0.75)',
                '--radius-lg': 'var(--radius)',
                '--radius-xl': 'calc(var(--radius) * 1.5)',
              } as CSSProperties
            }
          >
            <Category
              category={{
                ...forums[0]!,
                id: 100 + index,
                type: 'category',
                title: 'The Workshop',
                description: null,
              }}
              copy={copy}
            >
              {forums.map((forum) => (
                <Forum key={forum.id} forum={forum} copy={copy} />
              ))}
            </Category>
          </div>
          <div className="board-preview-footer">
            <span>{title} theme · Read-only preview</span>
            <a href={site.demo}>
              Open the demo <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
