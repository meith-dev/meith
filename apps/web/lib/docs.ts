import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { DocLink, DocSection } from "@/lib/docs-nav";
import { cache } from "react";

export type DocMetadata = {
  title: string;
  description: string;
  section: string;
  sectionOrder: number;
  order: number;
  slug: string;
  href: string;
  fileName: string;
  filePath: string;
};

export type DocPage = DocMetadata & {
  content: string;
};

const docsRoot = join(process.cwd(), "..", "..", "docs");

export const getAllDocs = cache((): DocPage[] => {
  return listMarkdownFiles(docsRoot)
    .map((filePath) => {
      const fileName = basename(filePath);
      const raw = readFileSync(filePath, "utf8");
      const { metadata, content } = parseDoc(raw, fileName);
      return {
        ...metadata,
        href: hrefFromSlug(metadata.slug),
        fileName,
        filePath: relative(docsRoot, filePath),
        content: stripMatchingTitle(content, metadata.title),
      };
    })
    .sort(compareDocs);
});

export function getDocsNav(): DocSection[] {
  const sections = new Map<string, DocPage[]>();
  for (const doc of getAllDocs()) {
    const items = sections.get(doc.section) ?? [];
    items.push(doc);
    sections.set(doc.section, items);
  }

  return [...sections.entries()]
    .sort(([, a], [, b]) => a[0].sectionOrder - b[0].sectionOrder)
    .map(([title, docs]) => ({
      title,
      items: docs.map((doc) => ({ title: doc.title, href: doc.href })),
    }));
}

export function getDocByPathname(pathname: string): DocPage | undefined {
  return getAllDocs().find((doc) => doc.href === normalizePathname(pathname));
}

export function getDocBySlugParts(slugParts: string[] = []): DocPage | undefined {
  const pathname = slugParts.length === 0 ? "/docs" : `/docs/${slugParts.join("/")}`;
  return getDocByPathname(pathname);
}

export function getAdjacentDocs(pathname: string): {
  prev: DocLink | null;
  next: DocLink | null;
} {
  const docs = getAllDocs();
  const index = docs.findIndex((doc) => doc.href === normalizePathname(pathname));
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? pickLink(docs[index - 1]) : null,
    next: index < docs.length - 1 ? pickLink(docs[index + 1]) : null,
  };
}

export function resolveMarkdownHref(href: string | undefined): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("/") || href.startsWith("http")) {
    return href;
  }

  const fileName = basename(href);
  const doc = getAllDocs().find((candidate) => candidate.fileName === fileName);
  return doc?.href ?? href;
}

function parseDoc(
  raw: string,
  fileName: string,
): {
  metadata: Omit<DocMetadata, "href" | "fileName" | "filePath">;
  content: string;
} {
  if (!raw.startsWith("---\n")) {
    throw new Error(`Doc ${fileName} is missing frontmatter.`);
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error(`Doc ${fileName} has unterminated frontmatter.`);
  }

  const fields = new Map<string, string>();
  for (const line of raw.slice(4, end).split("\n")) {
    const delimiter = line.indexOf(":");
    if (delimiter === -1) continue;
    const key = line.slice(0, delimiter).trim();
    const value = line
      .slice(delimiter + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    fields.set(key, value);
  }

  const metadata = {
    title: requireField(fields, "title", fileName),
    description: requireField(fields, "description", fileName),
    section: requireField(fields, "section", fileName),
    sectionOrder: Number(requireField(fields, "sectionOrder", fileName)),
    order: Number(requireField(fields, "order", fileName)),
    slug: normalizeSlug(requireField(fields, "slug", fileName)),
  };

  if (!Number.isFinite(metadata.sectionOrder) || !Number.isFinite(metadata.order)) {
    throw new Error(`Doc ${fileName} has invalid numeric ordering fields.`);
  }

  return {
    metadata,
    content: raw.slice(end + "\n---\n".length).trim(),
  };
}

function requireField(
  fields: Map<string, string>,
  key: string,
  fileName: string,
): string {
  const value = fields.get(key);
  if (!value) throw new Error(`Doc ${fileName} is missing frontmatter field "${key}".`);
  return value;
}

function stripMatchingTitle(content: string, title: string): string {
  const titleLine = `# ${title}`;
  return content.startsWith(titleLine)
    ? content.slice(titleLine.length).trimStart()
    : content;
}

function normalizeSlug(slug: string): string {
  if (slug === "/" || slug === "") return "/";
  return slug.replace(/^\/+|\/+$/g, "");
}

function hrefFromSlug(slug: string): string {
  return slug === "/" ? "/docs" : `/docs/${slug}`;
}

function normalizePathname(pathname: string): string {
  if (pathname === "/docs/") return "/docs";
  return pathname.replace(/\/+$/g, "");
}

function compareDocs(a: DocPage, b: DocPage): number {
  return (
    a.sectionOrder - b.sectionOrder || a.order - b.order || a.title.localeCompare(b.title)
  );
}

function pickLink(doc: DocPage | undefined): DocLink | null {
  return doc ? { title: doc.title, href: doc.href } : null;
}

function listMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}
