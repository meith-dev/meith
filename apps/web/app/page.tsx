import Link from "next/link"

import { BoardPreview } from "../src/components/board-preview"
import { CopyCommand } from "../src/components/copy-command"
import { SegmentCards } from "../src/components/segment-cards"
import {
  ClosingBand,
  DocsBand,
  LicenceBand,
  ProofBand,
  RunningBand,
} from "../src/components/site-bands"
import { readFacts } from "../src/content/facts"
import {
  alongside,
  capabilities,
  chooser,
  closing,
  genericBoard,
  hero,
  installCommand,
  losses,
  site,
} from "../src/content/site"
import { docHref, quickstartHref } from "../src/docs/registry"

/*
 * The general page. It makes the case that is true of every community and
 * then gets out of the way — the version with fixtures in it, or a raid
 * roster, or a bin collection, is one click away in `app/for/[segment]`.
 *
 * Two bands that used to be here have gone to where they belong: Dues is now
 * the feature section on the clubs page, because it is the most persuasive
 * thing on offer to a club and close to irrelevant to a gaming clan. Nothing
 * on this page is specific to anybody any more, which is the whole idea.
 */
export default async function LandingPage() {
  const facts = await readFacts()
  const startHref = quickstartHref()

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell grid gap-x-14 gap-y-14 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            {/*
              A sentence to a block. Left as one run of text, `text-wrap:
              balance` optimises for even line lengths and does not know a full
              stop from a comma, so it set "forgets. Your" as a line and buried
              the turn the whole headline is built on. Given a box each, the
              sentences break where they should and balance within themselves.
            */}
            <h1 className="display-hero max-w-[15ch] text-hero leading-[1.02]">
              <span className="block">{hero.headline.before}</span>
              <span className="block text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href={site.demo}>
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </a>
              <Link className="btn btn-quiet" href={startHref}>
                {hero.secondary}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <CopyCommand command={installCommand} />
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>

            <p className="max-w-[34rem] text-micro leading-[1.5] text-fg-subtle text-pretty">
              {hero.assurance}
            </p>
          </div>

          <figure className="flex flex-col gap-3">
            <BoardPreview board={genericBoard} />
            <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
              A board, in outline — its forums, what is in them, and the last thing said.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{chooser.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{chooser.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{chooser.lede}</p>
          </header>

          <div className="mt-10">
            <SegmentCards />
          </div>
        </div>
      </section>

      <section aria-label="What keeps happening" className="border-b border-border">
        <div className="shell py-14 sm:py-18">
          <div className="card-grid sm:grid-cols-2">
            {losses.map((loss) => (
              <div key={loss.complaint}>
                <h2 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg text-balance">
                  “{loss.complaint}”
                </h2>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">{loss.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{alongside.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{alongside.heading}</h2>
            <p className="text-fg-muted text-pretty">{alongside.lede}</p>
          </header>

          <div className="grid gap-6 sm:grid-cols-2 lg:pt-1">
            {alongside.columns.map((column, index) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="eyebrow">{column.title}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {column.items.map((item) => (
                    <li key={item} className={index === 0 ? "tag" : "tag tag-strong"}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-24">
          <header className="max-w-[46rem]">
            <p className="eyebrow">What you get</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Everything a community needs to feel at home.
            </h2>
            <p className="mt-4 text-fg-muted text-pretty">
              Six things your members and moderators will actually notice, and how each one is
              done. Each is also a link, because the page asserts and the document argues.
            </p>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Link
                key={capability.id}
                href={docHref(capability.doc, capability.anchor ?? undefined)}
              >
                <p className="font-mono text-micro tracking-[0.12em] text-fg-subtle">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="text-mid leading-[1.25] font-semibold tracking-[-0.02em] text-fg">
                  {capability.title}
                </h3>
                <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                  {capability.body}
                </p>
                <p className="mt-auto pt-4 font-mono text-micro text-fg-subtle">
                  <span className="card-arrow">{capability.link} →</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <RunningBand />
      <ProofBand facts={facts} />
      <LicenceBand />
      <DocsBand />
      <ClosingBand heading={closing.heading} body={closing.body} startHref={startHref} />
    </>
  )
}
