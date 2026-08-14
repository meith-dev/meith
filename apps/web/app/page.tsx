import Link from "next/link"

import { DemoLink } from "../src/components/demo-link"
import { SchemeScreenshot } from "../src/components/screenshot"
import { SegmentCards } from "../src/components/segment-cards"
import { ClosingBand } from "../src/components/site-bands"
import { Terminal } from "../src/components/terminal"
import { ThemeShowcase } from "../src/components/theme-showcase"
import { readFacts } from "../src/content/facts"
import {
  alongside,
  capabilities,
  chooser,
  closing,
  devices,
  extensible,
  finding,
  hero,
  licenceHref,
  memberships,
  openSource,
  shots,
  site,
  themes,
} from "../src/content/site"
import { docHref, quickstartHref } from "../src/docs/registry"

/*
 * The general page, in eight points and about five hundred words.
 *
 * It used to run to fourteen hundred, and the reason was not that anybody was
 * fond of the sound of their own voice — it was that `public/` held one icon
 * and nothing else. With no pictures, every visual claim had to be argued.
 * "It looks like your community, not like software" took fifty-five words and
 * was still only an assertion; five screenshots of one board in five themes
 * take none and are not an assertion at all.
 *
 * So the order here is the order a stranger needs it in, and each band is a
 * photograph with as little copy beside it as the photograph can carry:
 *
 *   1  what the thing is            hero, and the board itself
 *   2  it works on a phone          a phone in front of a desktop, no copy
 *   3  search                       results, and the measurement
 *   4  nothing ranked for you       beside it, because it is the same promise
 *   5  themes                       five, in light and dark, one board
 *   6  open source, your server     one band where there were three
 *   7  memberships                  the shop, photographed
 *   8  extensible                   counted from the generated documentation
 *
 * What was cut and where it went: the four losses now live on the five
 * `/for/*` pages, in each audience's own vocabulary, which is where they were
 * always more persuasive. The deployment routes and the licence explainer are
 * in `docs/quickstart.md`, `docs/self-hosting.md` and the licence, none of
 * which were improved by being summarised here.
 */
export default async function LandingPage() {
  const facts = await readFacts()
  const startHref = quickstartHref()
  const board = themes.list[0]!

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        {/*
          Text left, board right, rather than the board stacked underneath.
          Full-bleed under the copy the shot was handsome and cost most of a
          screen, which pushed the first actual claim — search — below the fold
          on a laptop. Beside the copy it does the same work in half the height,
          and the hero ends where the reader can still see there is a page under
          it. Below `lg` the grid collapses and the stack returns, which is the
          only arrangement that works at that width anyway.
        */}
        <div className="shell grid gap-x-12 gap-y-10 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex max-w-[42rem] flex-col items-start gap-6">
            <p className="badge">
              <span aria-hidden className="badge-dot" />
              {hero.badge}
            </p>

            {/*
              A sentence to a block. Left as one run of text, `text-wrap:
              balance` optimises for even line lengths and does not know a full
              stop from a comma, so it broke the headline in the middle of the
              phrase the whole thing turns on. Given a box each, the two halves
              break where they should and balance within themselves.

              And a step down from `text-hero`, which is sized for a headline
              running the full width of the shell. In a column beside the board
              it broke "A community / forum," — a line ending on an article,
              which is the one break a headline cannot afford.
            */}
            <h1 className="display-hero max-w-[20ch] text-huge leading-[1.06]">
              <span className="block">{hero.headline.before}</span>
              <span className="block text-accent">{hero.headline.emphasis}</span>
            </h1>

            <p className="lede max-w-[36rem]">{hero.lede}</p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <DemoLink className="btn btn-primary">
                {hero.primary}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </DemoLink>
              <Link className="btn btn-quiet" href={startHref}>
                {hero.secondary}
              </Link>
              <a className="textlink text-micro" href={site.repository}>
                Read the source
              </a>
            </div>
          </div>

          {/*
            Points one and two in one picture, and the second of them has no
            copy anywhere near it on purpose. "Works on mobile" is a claim; a
            phone standing in front of a desktop is the demonstration, and a
            reader has taken it in before they could have read a sentence
            about it. Writing one would only invite the doubt.
          */}
          <figure aria-label={devices.label} className="flex flex-col gap-3">
            <div className="devices">
              <SchemeScreenshot dark={board.dark} light={board.light} priority />
              <SchemeScreenshot
                className="devices-phone"
                dark={shots.threadMobile.dark}
                light={shots.threadMobile.light}
              />
            </div>
            <figcaption className="text-micro leading-[1.5] text-fg-subtle text-pretty">
              {hero.caption}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center">
          <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
              <p className="eyebrow">{finding.eyebrow}</p>
              <h2 className="display text-large leading-[1.15]">{finding.heading}</h2>
              <p className="text-fg-muted text-pretty">{finding.lede}</p>
            </header>

            {/*
              Point four sits in point three's band rather than in one of its
              own, because to a reader they are the same promise: the board
              shows you what you asked for and nothing else decides.
            */}
            <div className="flex flex-col gap-2 border-l-2 border-accent pl-4">
              <p className="font-medium text-fg">{finding.ranking.heading}</p>
              <p className="text-micro leading-[1.65] text-fg-muted text-pretty">
                {finding.ranking.body}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-micro leading-[1.65] text-fg-subtle text-pretty">
                {finding.evidence(facts)}
              </p>
              <p>
                <Link className="textlink text-micro" href={docHref("performance")}>
                  {finding.link}
                </Link>
              </p>
            </div>
          </div>

          <SchemeScreenshot dark={shots.search.dark} light={shots.search.light} />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">{themes.eyebrow}</p>
            <h2 className="display mt-3 text-large leading-[1.15]">{themes.heading}</h2>
            <p className="mt-4 text-fg-muted text-pretty">{themes.lede}</p>
          </header>

          <div className="mt-10">
            <ThemeShowcase />
          </div>

          <p className="mt-6">
            <Link className="textlink text-micro" href={docHref("theme-api")}>
              {themes.link}
            </Link>
          </p>
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
              <div className="flex flex-col gap-3" key={column.title}>
                <p className="eyebrow">{column.title}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {column.items.map((item) => (
                    <li className={index === 0 ? "tag" : "tag tag-strong"} key={item}>
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
        <div className="shell py-16 sm:py-20">
          <header className="max-w-[46rem]">
            <p className="eyebrow">What you get</p>
            <h2 className="display mt-3 text-large leading-[1.15]">
              Everything a community needs to feel at home.
            </h2>
          </header>

          <div className="card-grid mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability, index) => (
              <Link
                href={docHref(capability.doc, capability.anchor ?? undefined)}
                key={capability.id}
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

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="flex max-w-[40rem] flex-col gap-5">
            <p className="eyebrow">{openSource.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{openSource.heading}</h2>
            <p className="text-fg-muted text-pretty">{openSource.body}</p>
            <p className="border-l-2 border-accent pl-4 text-fg text-pretty">
              {openSource.emphasis}
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {openSource.links.map((link) => (
                <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
                  {link.label}
                </Link>
              ))}
              <a className="textlink text-micro" href={licenceHref}>
                {openSource.licenceLink}
              </a>
            </div>
          </div>

          <Terminal />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="shell grid gap-x-14 gap-y-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center">
          <SchemeScreenshot dark={shots.dues.dark} light={shots.dues.light} />

          <div className="flex flex-col gap-5">
            <p className="eyebrow">{memberships.eyebrow}</p>
            <h2 className="display text-large leading-[1.15]">{memberships.heading}</h2>
            <p className="text-fg-muted text-pretty">{memberships.body}</p>
            <p className="text-fg text-pretty">{memberships.emphasis}</p>
            <p>
              <a
                className="textlink text-micro"
                href={`${site.repository}/tree/main/plugins/dues`}
              >
                {memberships.link}
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell grid gap-x-14 gap-y-8 py-14 sm:py-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <header className="flex flex-col gap-3">
            <p className="eyebrow">{extensible.eyebrow}</p>
            <h2 className="display text-mid leading-[1.2]">{extensible.heading}</h2>
          </header>

          <div className="flex flex-col gap-6 lg:pt-1">
            <p className="max-w-[36rem] text-fg-muted text-pretty">{extensible.lede}</p>

            {/*
              Counted rather than claimed. Every figure is read out of the
              documentation at build time by `src/content/facts.ts`, and that
              documentation is generated from the code it describes — so a
              strip saying ninety-three hooks says it because there are
              ninety-three hooks, and a build where that stops being true
              fails rather than going quietly stale.
            */}
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {extensible.counts(facts).map((entry) => (
                <div key={entry.label}>
                  <dt className="eyebrow">{entry.label}</dt>
                  <dd className="mt-1 font-mono text-mid text-fg">{entry.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {extensible.links.map((link) => (
                <Link className="textlink text-micro" href={docHref(link.doc)} key={link.label}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
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

      <ClosingBand body={closing.body} heading={closing.heading} startHref={startHref} />
    </>
  )
}
