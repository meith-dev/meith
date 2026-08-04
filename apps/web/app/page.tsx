import Link from "next/link"

import { CopyCommand } from "../src/components/copy-command"
import { FieldCanvas } from "../src/components/field-canvas"
import { headlines, hero, installCommand, site, story } from "../src/content/site"
import { docHref, documentsInSection, sections } from "../src/docs/registry"

/**
 * The landing page.
 *
 * Short on purpose. The previous version tried to say everything — seven
 * capability cards, a four-step install sequence, a deployment pair and a
 * six-section documentation grid — and the effect of a page that argues every
 * point is that none of them is read. This one makes one claim, shows the
 * command that starts a board, names three things worth knowing, and hands the
 * reader to the documentation, which is where the arguing belongs.
 *
 * Every word still comes from `src/content/site.ts` and every document link from
 * the manifest.
 */
export default function LandingPage() {
  const running = sections.find((section) => section.id === "running")
  const primaryDoc = running ? documentsInSection(running.id).find((doc) => doc.primary) : undefined

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-wall">
        <FieldCanvas />
        <div aria-hidden className="hero-wash" />
        <div className="mx-auto flex w-[min(72rem,100%-2.5rem)] flex-col gap-7 pt-20 pb-20 sm:pt-28 sm:pb-28">
          <h1 className="display max-w-[16ch] text-hero leading-[0.96] tracking-[-0.028em]">
            {hero.headline.before}
            <em className="text-gorse italic">{hero.headline.emphasis}</em>
          </h1>

          <p className="max-w-[34rem] text-mid leading-[1.45] text-ink-soft text-pretty">
            {hero.lede}
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <CopyCommand command={installCommand} />
            <Link className="textlink" href={primaryDoc ? docHref(primaryDoc.slug) : "/docs"}>
              Get started
            </Link>
            <a className="textlink" href={site.repository}>
              Source
            </a>
          </div>
        </div>
      </section>

      {/*
        Three, not seven. Each is a claim a forum operator has been burned by
        before, and each is a link — the page asserts, the document argues.
      */}
      <section className="border-b border-wall">
        <div className="mx-auto w-[min(72rem,100%-2.5rem)] py-14 sm:py-16">
          <ul className="grid gap-x-12 gap-y-9 sm:grid-cols-3">
            {headlines.map((item) => (
              <li key={item.title} className="flex flex-col gap-2">
                <h2 className="font-display text-mid font-semibold tracking-[-0.01em] text-ink">
                  {item.title}
                </h2>
                <p className="text-micro leading-[1.6] text-pretty text-ink-soft">{item.body}</p>
                <Link
                  href={docHref(item.doc, item.anchor ?? undefined)}
                  className="mt-1 font-mono text-micro tracking-[0.08em] text-ink-faint uppercase transition-colors hover:text-gorse"
                >
                  {item.link} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-wall">
        <div className="mx-auto grid w-[min(72rem,100%-2.5rem)] gap-8 py-14 sm:py-16 lg:grid-cols-[14rem_1fr] lg:gap-16">
          <p className="eyebrow">{story.eyebrow}</p>
          <div className="flex max-w-[40rem] flex-col gap-4">
            <p className="display text-large leading-[1.25] text-ink">
              {story.lead.before}
              <span className="font-display text-gorse italic">{story.lead.term}</span>
              {story.lead.after}
            </p>
            <p className="text-pretty text-ink-soft">{story.paragraphs[0]}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid w-[min(72rem,100%-2.5rem)] gap-8 py-14 sm:py-16 lg:grid-cols-[14rem_1fr] lg:gap-16">
          <p className="eyebrow">Documentation</p>
          <div className="max-w-[42rem]">
            <p className="text-ink-soft text-pretty">
              Organised by what you are trying to do. Four of the references are generated from the
              code they describe, so one that disagrees with your board fails the build rather than
              misleading you.
            </p>
            <ul className="mt-6 grid gap-x-10 gap-y-1 sm:grid-cols-2">
              {sections.map((section) => {
                const primary = documentsInSection(section.id).find((doc) => doc.primary)
                if (!primary) return null
                return (
                  <li key={section.id}>
                    <Link
                      href={docHref(primary.slug)}
                      className="group flex items-baseline justify-between gap-4 border-b border-wall py-2.5"
                    >
                      <span className="text-ink transition-colors group-hover:text-gorse">
                        {section.title}
                      </span>
                      <span className="font-mono text-micro text-ink-faint">{primary.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <p className="mt-6">
              <Link href="/docs" className="textlink">
                All documents
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
