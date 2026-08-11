import type { Metadata } from "next"
import Link from "next/link"

import { SegmentCards } from "../../src/components/segment-cards"
import { chooser, site } from "../../src/content/site"
import { quickstartHref } from "../../src/docs/registry"

/*
 * The hub the header points at, and the parent of every segment page. It is
 * deliberately short: its whole job is to be a place a reader can land, see
 * the five, and leave for the one that is about them.
 */
export const metadata: Metadata = {
  title: { absolute: `Who Meith is for — clubs, neighbourhoods, communities and clans` },
  description:
    "Meith is community software for people who already have a community: sports clubs, " +
    "residents' associations, Discord and Slack communities, Facebook groups and gaming " +
    "clans. Each one gets a page of its own.",
  alternates: { canonical: "/for" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `Who ${site.name} is for`,
    description: site.tagline,
    url: `${site.url}/for`,
  },
}

export default function SegmentIndexPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="hero-grid" />
        <div aria-hidden className="hero-glow" />

        <div className="shell flex flex-col items-start gap-6 pt-14 pb-14 sm:pt-20 sm:pb-16">
          <nav aria-label="Breadcrumb" className="eyebrow">
            <Link className="transition-colors hover:text-fg" href="/">
              {site.name}
            </Link>
            <span aria-hidden className="px-1.5">
              /
            </span>
            <span>Who it&rsquo;s for</span>
          </nav>

          <h1 className="display-hero max-w-[18ch] text-huge leading-[1.04]">{chooser.heading}</h1>

          <p className="lede max-w-[38rem]">{chooser.lede}</p>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="shell py-14 sm:py-18">
          <SegmentCards />

          <p className="mt-10 max-w-[38rem] text-micro leading-[1.65] text-fg-subtle text-pretty">
            None of them quite you? The{" "}
            <Link className="textlink" href="/">
              general case
            </Link>{" "}
            is the same software with the specifics taken out, and the{" "}
            <Link className="textlink" href={quickstartHref()}>
              quickstart
            </Link>{" "}
            does not care what kind of community you are.
          </p>
        </div>
      </section>
    </>
  )
}
