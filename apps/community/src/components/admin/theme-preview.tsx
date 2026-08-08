"use client"

/**
 * The theme editor's sample board.
 *
 * ## Why three scenes and not one row of swatches
 *
 * The version this replaces painted one small card, four buttons and a line of
 * coloured words. It was already far better than swatches — a colour is only a
 * decision *relative to the things beside it* — but it could not show most of
 * what the editor lets an operator change. Thirteen of the board's tokens have
 * no button and no card: a pinned thread's title, a held post's ground, the
 * colour a moderator's name is written in, the tint behind the post a permalink
 * landed on. An operator changing those was choosing blind, and the only way to
 * see the result was to save it onto the live board.
 *
 * So the sample is three scenes — a community listing, a thread, and the controls —
 * and between them they render every colour token the theme declares. Each is
 * built out of the same utilities the real board uses, so `bg-card` here is
 * `bg-card` there: the sample cannot drift from the board by being written in
 * different classes, only by being written about different pages.
 *
 * ## Both schemes, always
 *
 * Both are on screen rather than behind a toggle, because they are **one
 * decision**. The commonest way to ruin a board from this screen is to pick a
 * colour that works on white and never look at it on black, and a toggle is a
 * way of never looking.
 *
 * One above the other rather than side by side, which is the opposite of what
 * the version before this did and is a consequence of the sample moving into a
 * column beside the form: two scenes across 26rem is 13rem each, at which width
 * a community row's title and its post count collide and the thing an operator is
 * judging is the layout's failure rather than their colours.
 *
 * ## The sample is also the index
 *
 * Every element here is painted by a token, and it knows which: `data-token` on
 * the thing itself, and one handler on the frame that opens that token's control
 * in the form beside it. So an operator who wants the colour of a locked thread
 * changed does not have to learn that it is called `thread-locked` — they point
 * at the locked thread.
 *
 * That inverts the hard part of this screen. A token list, however well grouped
 * and described, asks somebody to translate "the bit I do not like" into a name
 * before they can begin; the search box the list needs is evidence of the
 * problem rather than a solution to it.
 *
 * **It is a shortcut and not the only route.** Turning these spans into buttons
 * would put a control's focus ring and hit area inside the very thing being
 * judged for its appearance, so this is a pointer affordance — and the swatch
 * grid beside it reaches every token from the keyboard, in the same order, with
 * the same result.
 *
 * ## `data-theme-preview`, and why the palette is declared here
 *
 * The panel around the sample is painted by `:root`. An element inside it that
 * declared only the *overrides* would show the board's own colours everywhere
 * the theme had not overridden one — so the sample declares the whole effective
 * palette on its own element, and nothing about the surrounding page reaches in.
 *
 * The attribute is the no-JavaScript path's hook: the server-rendered preview
 * scopes its validated style block to it, so a preview cannot restyle the form
 * around it. An operator who has just previewed an unreadable colour must still
 * be able to see the control that puts it back.
 */

import { useId, useState } from "react"

/** The scenes, in the order the picker offers them. */
export const PREVIEW_SCENES = [
  {
    key: "communities",
    title: "Community list",
    blurb: "Categories, community rows and their read state — the board’s front page.",
  },
  {
    key: "thread",
    title: "A thread",
    blurb: "Posts, member names by group, and the tints behind a highlighted or held post.",
  },
  {
    key: "controls",
    title: "Controls",
    blurb: "Buttons, fields, badges and the moderation queue’s three states.",
  },
] as const

export type PreviewScene = (typeof PREVIEW_SCENES)[number]["key"]

const CHIP =
  "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/* ------------------------------------------------------------------ *
 * The scenes
 * ------------------------------------------------------------------ */

/**
 * The front page.
 *
 * Page, band and panel appear together and in that order, because the three are
 * only a decision relative to each other: a `surface` an operator picked while
 * looking at it alone is routinely the same value as the card beside it, and the
 * band then disappears on the live board.
 */
function CommunitiesScene() {
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
              <span data-token="community-unread" className="text-sm font-semibold text-community-unread">
                Announcements
              </span>
              <span className="text-xs text-muted-foreground">
                Last post by{" "}
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
              <span data-token="community-read" className="text-sm font-semibold text-community-read">
                Introductions
              </span>
              <span className="text-xs text-muted-foreground">
                Last post by{" "}
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
              <span data-token="community-locked" className="text-sm font-semibold text-community-locked">
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

/** A thread page: two posts, one of them the reader's own, one linked to. */
function ThreadScene() {
  return (
    <div className="flex flex-col gap-3">
      <p data-token="muted-foreground" className="text-xs text-muted-foreground">
        Kestrel Board → General discussion →{" "}
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

      <article data-token="post-highlight" className="rounded-md bg-post-highlight p-3 shadow-elevation">
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
          Your own posts carry a gentle tint so you can find yourself in a long thread. An{" "}
          <a data-token="primary" href="#preview" className="font-medium underline underline-offset-2">
            ordinary link
          </a>{" "}
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

/** Everything an operator presses, plus the queue that shows three states. */
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
        {/*
          The hover step shown as its own swatch rather than left to a real
          hover: this sample is also rendered on a phone, where there is no
          hover at all, and `primary-hover` is a field in the form beside it.
        */}
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

      <div data-token="card" className="flex flex-col gap-1 rounded-md bg-card p-3 shadow-elevation">
        <span className="text-xs font-medium">Thread title</span>
        {/*
          Drawn rather than focused: an operator cannot tab into a sample, and
          the focus ring is one of the three things on this board that has to
          clear 3:1 without being text. The outline and the border are separate
          elements so that each can be picked from — they are two tokens and two
          decisions, and the caption below says which is which.
        */}
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
  if (scene === "communities") return <CommunitiesScene />
  if (scene === "thread") return <ThreadScene />
  return <ControlsScene />
}

/* ------------------------------------------------------------------ *
 * The frame
 * ------------------------------------------------------------------ */

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
  /*
   * One handler on the frame rather than one per element: the scenes are markup
   * about a community, and threading a callback through forty spans would make them
   * markup about a callback. `closest` finds the innermost tagged ancestor, so a
   * button's label resolves to `primary-foreground` and the button itself to
   * `primary` — which is the distinction somebody clicking on a word means.
   *
   * `preventDefault` because one of the tagged elements is a link, and following
   * it is not what a click on a sample is for.
   */
  const pick = (event: React.MouseEvent<HTMLElement>): void => {
    if (onPick === undefined) return
    const tagged = (event.target as HTMLElement).closest<HTMLElement>("[data-token]")
    const token = tagged?.dataset.token
    if (token === undefined || token === "") return
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
          dark === true ? "dark" : ""
        } ${
          /*
            The affordance, as two arbitrary variants rather than a class on
            every tagged element: a pointer, and an outline drawn in the
            *sample's own* ring colour so that hovering a preview is one more
            place that colour is seen doing its job.
          */
          onPick === undefined
            ? ""
            : "[&_[data-token]]:cursor-pointer [&_[data-token]:hover]:outline-2 [&_[data-token]:hover]:outline-offset-2 [&_[data-token]:hover]:outline-ring"
        }`}
      >
        <Scene scene={scene} />
      </div>
    </div>
  )
}

/**
 * The sample, both schemes, with a scene picker.
 *
 * ## The picker is an enhancement, and says so by not existing without one
 *
 * The three scenes are a convenience of *space*, not of function: an operator
 * with no JavaScript is shown all three, stacked, because that is the honest
 * fallback for a control that cannot work — and because the whole reason to
 * choose between them is that a live sample repaints as a slider moves, which is
 * a JavaScript claim in the first place.
 *
 * Rendering the picker only once mounted also keeps the first client render
 * identical to the server's, which is what React asks of hydration.
 */
export function ThemePreview({
  light,
  dark,
  hydrated,
  onPick,
}: {
  light: React.CSSProperties
  dark: React.CSSProperties
  /** True once the browser has taken over; see the note above. */
  hydrated: boolean
  /** Open the control for the token that paints whatever was clicked. */
  onPick?: ((token: string) => void) | undefined
}) {
  const [scene, setScene] = useState<PreviewScene>("communities")
  const groupId = useId()

  const shown = hydrated ? PREVIEW_SCENES.filter((entry) => entry.key === scene) : PREVIEW_SCENES

  return (
    <section className="flex flex-col gap-3" id="preview">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">Live sample</h3>
        <p className="text-xs text-muted-foreground">
          Painted from the form as you type — nothing here has been saved. Both schemes are
          shown because they are one decision: a colour that works on white often disappears
          on black. Custom CSS is not painted here; “Preview without saving” includes it.
        </p>
        {hydrated && onPick !== undefined && (
          <p className="text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">
              Click anything in the sample
            </strong>{" "}
            to open the token that paints it — the swatches beside it do the same thing from
            the keyboard.
          </p>
        )}
      </div>

      {hydrated && (
        <div role="group" aria-label="Which part of the board to sample" className="flex flex-wrap gap-2">
          {PREVIEW_SCENES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={scene === entry.key}
              onClick={() => setScene(entry.key)}
              className={`${CHIP} ${
                scene === entry.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent hover:text-accent-foreground"
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

/**
 * The frame on its own, for the server-rendered preview.
 *
 * The no-JavaScript path posts the form, the action validates exactly as a save
 * would and hands back a scoped style block; this renders the same chrome with
 * no palette of its own so that block is what paints it. Same component, so what
 * the two previews show cannot drift apart.
 */
export function ValidatedSample({ scene = "communities" }: { scene?: PreviewScene }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SampleFrame label="Light" palette={{}} scene={scene} />
      <SampleFrame label="Dark" palette={{}} scene={scene} dark />
    </div>
  )
}
