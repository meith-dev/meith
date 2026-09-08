import { type ComponentType, createElement, type ReactNode } from 'react'

import type { Translator } from '@meith/i18n'
import {
  type ResolvedTheme,
  requireSlot,
  SLOT_NAMES,
  type SlotModels,
  type SlotName,
  slotCopy,
} from '@meith/theme-kit'
import { buttonVariants, Card, CardContent, Input, Textarea } from '@meith/ui'

import { PollForm } from '@/components/content/poll'
import { ThreadRatingForm } from '@/components/content/thread-rating'
import { HeaderPeekEnhancer } from '@/components/shell/header-peek-enhancer'
import { NavDisclosureEnhancer } from '@/components/shell/nav-disclosure-enhancer'
import { ThemeSwitcher } from '@/components/shell/theme-switcher'
import { getTranslator } from '@/server/i18n'
import { currentTheme } from '@/server/theme'
import { threadRatingCopy } from '@/view/content-copy'
import { buildEditorToolbarModel } from '@/view/editor-toolbar'

import { fixtureModel, fixtureVariants } from './preview.fixture'
import { PreviewBoundary } from './preview-boundary'

const READ_ONLY = 'Fixture preview: controls can be edited, but submissions are not saved.'
const SAMPLE =
  'A reply with **bold text**, a [link](/), and a short list.\n\n- First point\n- Second point'

function previewActions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(previewActions)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (key === 'action' || key.endsWith('Action')) && typeof entry === 'string'
        ? '/fixtures'
        : previewActions(entry),
    ]),
  )
}

export function renderFixture(
  theme: ResolvedTheme,
  t: Translator,
  selected: SlotName,
  variant: string,
): ReactNode {
  function model<K extends SlotName>(name: K): SlotModels[K] {
    return previewActions(
      fixtureModel(name, name === selected ? variant : 'default'),
    ) as SlotModels[K]
  }
  function slot<K extends SlotName>(name: K, overrides: Partial<SlotModels[K]> = {}): ReactNode {
    return createElement(requireSlot(theme, name) as ComponentType<object>, {
      ...model(name),
      ...overrides,
      copy: slotCopy(theme, name, t),
    })
  }
  const badge = (
    <span className="inline-flex rounded border border-border bg-muted px-2 py-1 text-xs">
      Community helper
    </span>
  )
  const form = (mode: 'thread' | 'reply' | 'edit' = 'reply') => (
    <form action="/fixtures" method="post" className="space-y-4">
      {mode === 'thread' && (
        <label className="block space-y-2">
          <span>Subject</span>
          <Input name="subject" defaultValue="Ideas for our next meetup" />
        </label>
      )}
      <label htmlFor="fixture-message" className="block text-sm font-medium">
        Message
      </label>
      <div className="overflow-hidden rounded-md border border-border">
        {slot(
          'EditorToolbar',
          buildEditorToolbarModel({ textareaId: 'fixture-message', attachments: true, t }),
        )}
        <Textarea
          id="fixture-message"
          name="message"
          rows={8}
          defaultValue={SAMPLE}
          className="rounded-none border-0"
        />
      </div>
      <label className="block space-y-2 text-sm">
        <span>Attachments</span>
        <Input type="file" id="fixture-message-attachment" multiple />
      </label>
      {mode === 'edit' && (
        <label className="block space-y-2">
          <span>Reason for editing</span>
          <Input name="reason" defaultValue="Corrected the meeting time" />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked />
        Notify me of replies
      </label>
      <button type="submit" className={buttonVariants({ variant: 'primary' })}>
        Preview submission
      </button>
    </form>
  )
  const actions = () => slot('PostActions')
  const post = () =>
    slot('PostBit', {
      regions: {
        actions: actions(),
        pluginBadges: badge,
        pluginFooter: (
          <p className="text-sm text-muted-foreground">3 members found this helpful.</p>
        ),
      },
    })
  const pagination = () => slot('Pagination')
  const quickReply = () => slot('QuickReply', { children: form() })
  const category = () => slot('CategoryBlock', { children: slot('ForumRow') })
  const viewer = selected === 'Header' ? model('Header').viewer : model('UserPanel').viewer
  const userPanel = () =>
    slot('UserPanel', {
      viewer,
      ...(viewer.isGuest
        ? {
            links: [
              { label: 'Log in', href: '/login' },
              { label: 'Register', href: '/register' },
            ],
            unreadNotifications: { value: 0, label: '0' },
            unreadMessages: { value: 0, label: '0' },
          }
        : {}),
      children: viewer.isGuest ? null : (
        <button type="button" className={buttonVariants({ variant: 'ghost' })}>
          Log out
        </button>
      ),
    })
  const header = () => slot('Header', { children: userPanel() })
  const footer = () => slot('Footer', { regions: { controls: slot('ForumJump') } })
  const board = () =>
    slot('BoardIndex', {
      regions:
        variant === 'empty' && selected === 'BoardIndex'
          ? model('BoardIndex').regions
          : {
              categories: category(),
              stats: slot('BoardStats'),
              online: slot('WhoIsOnline'),
              latest: (
                <>
                  {slot('LatestThreads')}
                  {slot('LatestPosts')}
                </>
              ),
              announcements: slot('Announcement'),
              plugins: badge,
            },
    })
  const listing = () =>
    slot('ForumDisplay', {
      regions:
        variant === 'empty' && selected === 'ForumDisplay'
          ? model('ForumDisplay').regions
          : {
              subforums: slot('SubforumList'),
              threads: slot('ThreadRow', { regions: { pluginBadges: badge } }),
              pagination: pagination(),
              announcements: slot('Announcement'),
            },
    })
  const rating = { average: 4.2, count: 12, mine: null }
  const thread = () =>
    slot('ThreadView', {
      regions: {
        posts: post(),
        pagination: pagination(),
        quickReply: ['guest', 'locked'].includes(variant) ? null : quickReply(),
        tools:
          variant === 'poll' ? (
            <PollForm
              threadId={91}
              canVote={false}
              poll={{
                id: 1,
                threadId: 91,
                question: 'When should we meet?',
                createdAt: new Date('2026-03-12T09:14:00Z'),
                closesAt: null,
                maxOptions: 1,
                publicVotes: true,
                allowRevote: true,
                votedOptionIds: [1],
                options: [
                  {
                    id: 1,
                    label: 'Friday evening',
                    votes: 8,
                    voters: [{ userId: 12, username: 'Marlow', votedAt: null }],
                  },
                  { id: 2, label: 'Saturday morning', votes: 4, voters: [] },
                  { id: 3, label: 'Sunday afternoon', votes: 0, voters: [] },
                ],
              }}
            />
          ) : null,
        afterContent: (
          <ThreadRatingForm
            threadId={91}
            rating={rating}
            canRate={false}
            copy={threadRatingCopy(rating, t)}
          />
        ),
      },
    })
  const panelBody = () => (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <label className="block space-y-2">
          <span>Display name</span>
          <Input defaultValue="Wren" />
        </label>
        <label htmlFor="fixture-bio" className="block space-y-2">
          <span>Biography</span>
          <Textarea
            id="fixture-bio"
            defaultValue="Building a friendly community, one conversation at a time."
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked />
          Show my online status
        </label>
        <button type="button" className={buttonVariants({ variant: 'primary' })}>
          Save changes
        </button>
        <p className="text-sm text-muted-foreground">No changes have been saved.</p>
      </CardContent>
    </Card>
  )
  const section = () =>
    slot('PanelSection', {
      regions: { description: 'Manage the details shown beside your posts.', actions: badge },
      children: panelBody(),
    })
  const panelKind =
    selected === 'PanelPage'
      ? model('PanelPage').panel
      : selected === 'PanelNav'
        ? model('PanelNav').panel
        : model('PanelShell').panel
  const panelPage = () =>
    slot('PanelPage', {
      panel: panelKind,
      title: 'Profile settings',
      regions: {
        lede: 'Personal details and preferences.',
        meta: 'Last updated 12 Mar 2026',
        actions: null,
      },
      children: section(),
    })
  const panel = () =>
    slot('PanelShell', {
      panel: panelKind ?? 'usercp',
      regions: { nav: slot('PanelNav', { panel: panelKind ?? 'usercp' }) },
      children: panelPage(),
    })

  switch (selected) {
    case 'Shell':
      return slot('Shell', {
        children: (
          <>
            {header()}
            {board()}
            {footer()}
          </>
        ),
      })
    case 'Header':
      return header()
    case 'UserPanel':
      return userPanel()
    case 'Footer':
      return footer()
    case 'BoardIndex':
      return board()
    case 'CategoryBlock':
    case 'ForumRow':
      return category()
    case 'ForumDisplay':
    case 'ThreadRow':
      return listing()
    case 'ThreadView':
      return thread()
    case 'PostBit':
      return post()
    case 'QuickReply':
      return quickReply()
    case 'PostForm':
      return slot('PostForm', { regions: { form: form(model('PostForm').mode), toolbar: null } })
    case 'EditorToolbar':
      return form('thread')
    case 'MemberProfile':
      return slot('MemberProfile', { regions: variant === 'minimal' ? {} : { plugins: badge } })
    case 'AuthPage':
      return slot('AuthPage', {
        regions: {
          lede: 'Join the conversation.',
          form: (
            <form action="/fixtures" method="post" className="space-y-4">
              <label className="block space-y-2">
                <span>Email address</span>
                <Input type="email" defaultValue="wren@example.test" autoComplete="off" />
              </label>
              {variant !== 'reset' && (
                <label className="block space-y-2">
                  <span>Password</span>
                  <Input type="password" autoComplete="off" />
                </label>
              )}
              <button type="submit" className={buttonVariants({ variant: 'primary' })}>
                Continue
              </button>
            </form>
          ),
          note: READ_ONLY,
        },
      })
    case 'PanelShell':
    case 'PanelNav':
      return panel()
    case 'PanelPage':
      return variant === 'standalone' ? panelPage() : panel()
    case 'PanelSection':
      return section()
    default:
      return slot(selected)
  }
}

export async function FixtureGallery({ name, variant }: { name: SlotName; variant: string }) {
  const [theme, t] = await Promise.all([currentTheme(), getTranslator()])
  const Shell = requireSlot(theme, 'Shell')
  const preview = renderFixture(theme, t, name, variant)
  return (
    <div className="text-foreground">
      <header className="space-y-4 border-b border-border bg-card px-4 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Theme fixtures</h1>
          <a href="/" className="text-sm underline">
            Back to the board
          </a>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every theme slot, including signed-in and staff presentation states. These are sample
          models, not a login. {READ_ONLY}
        </p>
        <form action="/fixtures" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block">Slot</span>
            <select
              name="slot"
              defaultValue={name}
              className="rounded border border-border bg-background p-2"
            >
              {SLOT_NAMES.map((slot) => (
                <option key={slot}>{slot}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
            Show slot
          </button>
        </form>
        <nav aria-label="Fixture states" className="flex flex-wrap gap-2">
          {fixtureVariants(name).map((state) => (
            <a
              key={state}
              href={`/fixtures?slot=${name}&variant=${state}`}
              aria-current={state === variant ? 'page' : undefined}
              className="rounded border border-border px-3 py-1 text-sm aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {state}
            </a>
          ))}
        </nav>
        <ThemeSwitcher />
      </header>
      <NavDisclosureEnhancer />
      <HeaderPeekEnhancer />
      <PreviewBoundary message={READ_ONLY}>
        <div data-fixture-slot={name} data-fixture-variant={variant} className="min-w-0 p-4 sm:p-8">
          {name === 'Shell' ? (
            preview
          ) : (
            <Shell {...fixtureModel('Shell')} copy={slotCopy(theme, 'Shell', t)}>
              {preview}
            </Shell>
          )}
        </div>
      </PreviewBoundary>
    </div>
  )
}
