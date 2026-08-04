import Link from "next/link"

import { CopyCommand } from "../src/components/copy-command"
import { FieldCanvas } from "../src/components/field-canvas"
import {
  capabilities,
  deployment,
  hero,
  installCommand,
  quickStart,
  site,
  story,
} from "../src/content/site"
import { docHref, documentsInSection, sections } from "../src/docs/registry"

/**
 * The landing page.
 *
 * Every word on it comes from `src/content/site.ts` and every document link from
 * the manifest — the page itself decides layout and nothing else. That is the
 * difference between this and the `site/index.html` it replaces, where the
 * install command appeared twice in the markup and the footer named four
 * documents by hand, two of which had since been renamed.
 */
export default function LandingPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-wall">
        <FieldCanvas />
        {/* Washes the canvas out under the text without hiding it at the edge. */}
        <div aria-hidden className="hero-wash" />
        <div className="mx-auto flex w-[min(72rem,100%-2.5rem)] flex-col gap-8 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <h1 className="display max-w-[16ch] text-hero leading-[0.96] tracking-[-0.028em]">
            {hero.headline.before}
            <em className="text-gorse italic">{hero.headline.emphasis}</em>
          </h1>

          <p className="max-w-[34rem] text-mid leading-[1.45] text-ink-soft text-pretty">
            {hero.lede}
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <CopyCommand command={installCommand} />
            <a className="textlink" href={site.repository}>
              Read the source
            </a>
            <Link className="textlink" href="/docs">
              Documentation
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-wall">
        <div className="mx-auto grid w-[min(72rem,100%-2.5rem)] gap-10 py-14 sm:py-20 lg:grid-cols-[14rem_1fr] lg:gap-16">
          <p className="eyebrow">{story.eyebrow}</p>
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="display text-large leading-[1.25] text-ink">
              {story.lead.before}
              <span className="font-display text-gorse italic">{story.lead.term}</span>
              {story.lead.after}
            </p>
            {story.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-pretty text-ink-soft">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-wall">
        <div className="mx-auto w-[min(72rem,100%-2.5rem)] py-14 sm:py-20">
          <p className="eyebrow">What you get</p>
          <h2 className="display mt-2 max-w-[20ch] text-huge leading-[1.02]">
            A board that holds up under a real community.
          </h2>

          <ul className="cell-grid mt-10 sm:grid-cols-2 xl:grid-cols-3">
            {capabilities.map((capability) => (
              <li key={capability.title}>
                <h3 className="font-display text-mid font-semibold tracking-[-0.01em] text-ink">
                  {capability.title}
                </h3>
                <p className="text-pretty text-ink-soft">{capability.body}</p>
                <Link
                  href={docHref(capability.doc, capability.anchor ?? undefined)}
                  className="mt-auto pt-3 font-mono text-micro tracking-[0.08em] text-ink-faint uppercase transition-colors hover:text-gorse"
                >
                  How it works →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-wall">
        <div className="mx-auto w-[min(72rem,100%-2.5rem)] py-14 sm:py-20">
          <p className="eyebrow">{deployment.eyebrow}</p>
          <h2 className="display mt-2 max-w-[20ch] text-huge leading-[1.02]">
            {deployment.heading}
          </h2>

          <div className="mt-10 grid gap-px border border-wall bg-wall sm:grid-cols-2">
            {deployment.options.map((option) => (
              <div key={option.title} className="flex flex-col gap-2 bg-ground p-7">
                <h3 className="font-display text-mid font-semibold text-ink">{option.title}</h3>
                <p className="text-ink-soft">{option.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-wall">
        <div className="mx-auto w-[min(72rem,100%-2.5rem)] py-14 sm:py-20">
          <p className="eyebrow">{quickStart.eyebrow}</p>
          <h2 className="display mt-2 max-w-[20ch] text-huge leading-[1.02]">
            {quickStart.heading}
          </h2>

          <ol className="mt-10 max-w-[46rem] list-none">
            {quickStart.steps.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[2.6rem_1fr] gap-x-5 border-t border-wall py-4 last:border-b"
              >
                <span className="pt-1 font-mono text-micro tabular-nums tracking-[0.08em] text-gorse">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <b className="font-semibold text-ink">{step.title}</b>{" "}
                  {step.command ? (
                    <code className="font-mono text-[0.92em] text-ink-soft">{step.command}</code>
                  ) : null}
                  <p className="mt-1 text-micro leading-[1.55] text-ink-soft">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 max-w-[46rem] overflow-x-auto rounded-sm border border-wall bg-ground-deep p-5 font-mono text-micro leading-[1.85]">
            {quickStart.transcript.map((line) => (
              <div key={line.command} className="whitespace-pre">
                <span className="text-gorse">$</span> {line.command}
                {line.note ? <span className="text-ink-faint">{`   # ${line.note}`}</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-[min(72rem,100%-2.5rem)] py-14 sm:py-20">
          <p className="eyebrow">Documentation</p>
          <h2 className="display mt-2 max-w-[22ch] text-huge leading-[1.02]">
            Written for the person doing the thing.
          </h2>
          <p className="mt-4 max-w-[42rem] text-ink-soft text-pretty">
            Each document has one audience and one job. The four generated references are written
            from the code itself, so a reference that disagrees with the board fails the build
            rather than misleading you.
          </p>

          <ul className="cell-grid mt-10 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => {
              const primary = documentsInSection(section.id).find((doc) => doc.primary)
              return (
                <li key={section.id}>
                  <h3 className="font-display text-mid font-semibold text-ink">{section.title}</h3>
                  <p className="text-micro text-pretty text-ink-soft">{section.blurb}</p>
                  {primary ? (
                    <Link
                      href={docHref(primary.slug)}
                      className="mt-auto pt-3 font-mono text-micro tracking-[0.08em] text-ink-faint uppercase transition-colors hover:text-gorse"
                    >
                      {primary.title} →
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </>
  )
}
