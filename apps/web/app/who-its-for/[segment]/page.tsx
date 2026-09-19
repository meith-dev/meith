import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Breadcrumb, ClosingBand, DocLinks } from '../../../src/components/site-bands'
import {
  audienceHref,
  audienceIndexHref,
  findSegment,
  segments,
} from '../../../src/content/segments'
import { site } from '../../../src/content/site'
import { docHref, quickstartHref } from '../../../src/docs/registry'
import { ogImage } from '../../../src/og/card'

export function generateStaticParams() {
  return segments.map((segment) => ({ segment: segment.slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>
}): Promise<Metadata> {
  const { segment: slug } = await params
  const segment = findSegment(slug)
  if (!segment) return {}

  const canonical = audienceHref(segment.slug)

  return {
    title: { absolute: segment.meta.title },
    description: segment.meta.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: segment.meta.title,
      description: segment.meta.description,
      url: `${site.url}${canonical}`,
      images: ogImage(`${audienceIndexHref}/og/${segment.slug}`, segment.meta.title),
    },
    twitter: {
      card: 'summary_large_image',
      title: segment.meta.title,
      description: segment.meta.description,
    },
  }
}

const summaries: Readonly<
  Record<
    string,
    { lead: string; features: readonly { title: string; body: string }[]; detail: string }
  >
> = {
  'open-source': {
    lead: 'Make room for support, ideas and the people behind your project. On your own domain, alongside your code.',
    features: [
      {
        title: 'Answer once. Help everyone.',
        body: 'Searchable threads give every useful answer a lasting URL.',
      },
      {
        title: 'Open to curious people.',
        body: 'Visitors can read without an account. Members can sign in with passwords, passkeys or GitHub.',
      },
      {
        title: 'Make it part of your project.',
        body: 'Typed themes, plugins and a REST API fit the tools you already use.',
      },
    ],
    detail:
      'Server-rendered pages load quickly, work without JavaScript and put your project’s knowledge within reach of search engines.',
  },
  communities: {
    lead: 'The discussions, guides and gatherings that bring people together. In a place that feels like you.',
    features: [
      {
        title: 'A place to return to.',
        body: 'Keep useful answers and announcements close, long after the chat has moved on.',
      },
      {
        title: 'Everyone gets a link.',
        body: 'No app to install. No account needed to read public discussions.',
      },
      {
        title: 'Your own look and feel.',
        body: 'Adapt a theme or build your own. Add events or memberships when you need them.',
      },
    ],
    detail:
      'A technical member sets up the board. Organisers manage forums, announcements, members and permissions from the browser.',
  },
  'clubs-and-associations': {
    lead: 'From the first meeting to the next committee. Keep your club’s people, plans and shared history in one place.',
    features: [
      {
        title: 'Keep everyone in the loop.',
        body: 'Announcements stay visible. Discussions and decisions are easy to find again.',
      },
      {
        title: 'Take care of membership.',
        body: 'Add the Dues plugin for paid memberships through Stripe and automatic access to member areas.',
      },
      {
        title: 'Ready for the next committee.',
        body: 'Hand over roles in the admin panel. Keep the same board, domain and archive.',
      },
    ],
    detail:
      'Run the board in the club’s name. One technical member handles setup; the rest of the committee can run it from a browser.',
  },
  'legacy-forums': {
    lead: 'A new foundation for the community you already have. Bring your MyBB or phpBB history along for the ride.',
    features: [
      {
        title: 'Keep the conversations.',
        body: 'Move members, posts, private messages, attachments, polls and more.',
      },
      {
        title: 'Keep the familiar sign-in.',
        body: 'Imported members can use the passwords they already know.',
      },
      {
        title: 'Keep the old links working.',
        body: 'Redirects take visitors from old URLs to the same discussions on your new board.',
      },
    ],
    detail:
      'Start with a copy of your database and explore the result. The migration guide covers what moves, what changes and when to switch your domain.',
  },
}

export default async function SegmentPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment: slug } = await params
  const segment = findSegment(slug)
  if (!segment) notFound()

  const summary = summaries[slug]
  if (!summary) notFound()
  const startHref = quickstartHref()

  return (
    <div className="marketing-page">
      <section className="shell marketing-hero marketing-hero-compact">
        <Breadcrumb
          current={segment.name}
          trail={[
            { label: site.name, href: '/' },
            { label: 'Who it’s for', href: audienceIndexHref },
          ]}
        />
        <div className="marketing-hero-copy">
          <h1 className="marketing-title">
            {segment.hero.headline.before}
            <br />
            <span>{segment.hero.headline.emphasis}</span>
          </h1>
          <div>
            <p className="marketing-lead">{summary.lead}</p>
            <div className="marketing-actions">
              <Link className="btn btn-primary" href={startHref}>
                Get started <span aria-hidden>→</span>
              </Link>
              <Link className="textlink" href={docHref('themes')}>
                Make it yours
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="shell marketing-section">
        <div className="marketing-values">
          {summary.features.map((feature, index) => (
            <article key={feature.title}>
              <span className="marketing-number">0{index + 1}</span>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell marketing-section marketing-detail">
        <div>
          <p className="eyebrow">{segment.feature.eyebrow}</p>
          <h2>{segment.feature.heading}</h2>
        </div>
        <div>
          <p className="marketing-lead">{summary.detail}</p>
          <DocLinks links={segment.feature.links} />
        </div>
      </section>

      <ClosingBand
        heading="A good home for your people."
        body="Open source. Self-hosted. Yours to shape."
        startHref={startHref}
      />
    </div>
  )
}
