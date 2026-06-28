import { DocsPager } from "@/components/docs/docs-pager";
import { MarkdownDoc } from "@/components/docs/markdown";
import { DocHeader } from "@/components/docs/prose";
import { getAllDocs, getDocBySlugParts } from "@/lib/docs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type DocsPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({
    slug: doc.slug === "/" ? [] : doc.slug.split("/"),
  }));
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlugParts(slug);
  if (!doc) return {};

  return {
    title: doc.title,
    description: doc.description,
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const doc = getDocBySlugParts(slug);
  if (!doc) notFound();

  return (
    <>
      <DocHeader eyebrow={doc.section} title={doc.title} description={doc.description} />
      <MarkdownDoc content={doc.content} />
      <DocsPager pathname={doc.href} />
    </>
  );
}
