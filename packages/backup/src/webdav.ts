import { createReadStream, createWriteStream } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { ConfigurationError, ValidationError } from '@meith/core'

import { isBundleName } from './bundle'
import type {
  BackupDestination,
  RemoteBundle,
  RemoteBundleBody,
  WebDavDestinationConfig,
} from './destination'
import { type RetentionPolicy, retentionCandidates } from './retention'

export interface WebDavResponse {
  readonly status: number
  readonly headers: http.IncomingHttpHeaders
  readonly body: Readable
}

export type WebDavRequester = (input: {
  readonly method: string
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly body?: Readable | string | undefined
}) => Promise<WebDavResponse>

const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>'

export function nodeRequester(): WebDavRequester {
  return ({ method, url, headers, body }) =>
    new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http
      const request = transport.request(url, { method, headers }, (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
        })
      })
      request.on('error', reject)
      if (body === undefined) request.end()
      else if (typeof body === 'string') request.end(body)
      else body.pipe(request)
    })
}

async function drain(body: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks).toString('utf8')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

export function parsePropfind(xml: string): readonly { href: string; size: number | null }[] {
  const entries: { href: string; size: number | null }[] = []
  for (const block of xml.matchAll(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/g)) {
    const text = block[0]
    const href = /<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/.exec(text)?.[1]
    if (href === undefined) continue
    const length = /<(?:\w+:)?getcontentlength[^>]*>\s*(\d+)\s*<\/(?:\w+:)?getcontentlength>/.exec(
      text,
    )?.[1]
    entries.push({
      href: unescapeXml(href.trim()),
      size: length === undefined ? null : Number(length),
    })
  }
  return entries
}

export class WebDavBackupDestination implements BackupDestination {
  private readonly base: URL

  private readonly requester: WebDavRequester

  constructor(
    private readonly config: WebDavDestinationConfig,
    requester?: WebDavRequester,
  ) {
    this.base = new URL(config.url)
    this.requester = requester ?? nodeRequester()
  }

  get description(): string {
    return `the WebDAV folder at ${this.base.origin}${this.base.pathname}`
  }

  private url(name: string): URL {
    if (!isBundleName(name)) {
      throw new ValidationError(`Not a backup bundle name: ${JSON.stringify(name)}`)
    }
    return new URL(name, this.base)
  }

  private headers(extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
    const auth =
      this.config.username === ''
        ? {}
        : {
            Authorization: `Basic ${Buffer.from(
              `${this.config.username}:${this.config.password}`,
            ).toString('base64')}`,
          }
    return { ...auth, ...extra }
  }

  private failure(action: string, status: number): ConfigurationError {
    return new ConfigurationError(
      `${this.description} answered ${status} to ${action}.` +
        (status === 401 || status === 403
          ? ' Check the WebDAV username and password, and that the account may write there.'
          : status === 404 || status === 409
            ? ' Check that the folder exists: the destination creates bundles, not the folder.'
            : ''),
    )
  }

  async putFile(name: string, filePath: string, size: number): Promise<void> {
    const response = await this.requester({
      method: 'PUT',
      url: this.url(name),
      headers: this.headers({
        'Content-Type': 'application/gzip',
        'Content-Length': String(size),
      }),
      body: createReadStream(filePath),
    })
    response.body.resume()
    if (response.status < 200 || response.status >= 300) {
      throw this.failure(`uploading ${name}`, response.status)
    }
  }

  async list(): Promise<readonly RemoteBundle[]> {
    const response = await this.requester({
      method: 'PROPFIND',
      url: this.base,
      headers: this.headers({
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(PROPFIND_BODY)),
      }),
      body: PROPFIND_BODY,
    })
    const xml = await drain(response.body)
    if (response.status !== 207 && response.status !== 200) {
      throw this.failure('listing the folder', response.status)
    }

    const bundles: RemoteBundle[] = []
    for (const entry of parsePropfind(xml)) {
      const segment = entry.href.replace(/\/+$/, '').split('/').pop() ?? ''
      let name: string
      try {
        name = decodeURIComponent(segment)
      } catch {
        continue
      }
      if (isBundleName(name)) bundles.push({ name, size: entry.size ?? 0 })
    }
    return bundles.sort((a, b) => a.name.localeCompare(b.name))
  }

  async open(name: string): Promise<RemoteBundleBody | null> {
    const response = await this.requester({
      method: 'GET',
      url: this.url(name),
      headers: this.headers(),
    })
    if (response.status === 404) {
      response.body.resume()
      return null
    }
    if (response.status < 200 || response.status >= 300) {
      response.body.resume()
      throw this.failure(`downloading ${name}`, response.status)
    }
    const length = response.headers['content-length']
    const size = typeof length === 'string' && /^\d+$/.test(length) ? Number(length) : null
    return { body: Readable.toWeb(response.body) as ReadableStream<Uint8Array>, size }
  }

  async getToFile(name: string, outPath: string): Promise<void> {
    const opened = await this.open(name)
    if (opened === null) {
      throw new ValidationError(
        `${this.description} has no bundle named ${name}. meith backup:list names what it holds.`,
      )
    }
    await pipeline(
      Readable.fromWeb(opened.body as import('node:stream/web').ReadableStream<Uint8Array>),
      createWriteStream(outPath, { mode: 0o600 }),
    )
  }

  async delete(name: string): Promise<void> {
    const response = await this.requester({
      method: 'DELETE',
      url: this.url(name),
      headers: this.headers(),
    })
    response.body.resume()
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
      throw this.failure(`deleting ${name}`, response.status)
    }
  }

  async prune(policy: RetentionPolicy, now: Date = new Date()): Promise<readonly string[]> {
    const stale = retentionCandidates(
      (await this.list()).map((bundle) => bundle.name),
      policy,
      now,
    )
    for (const name of stale) await this.delete(name)
    return stale
  }
}
