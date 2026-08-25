import { createServer } from 'node:http'

import { E2E_FAKE_MAIL_PORT, E2E_FAKE_MAIL_TOKEN } from './config'

interface DeliveredMail {
  readonly at: number
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string | null
}

const delivered: DeliveredMail[] = []

function json(body: unknown, status = 200): { status: number; body: string } {
  return { status, body: JSON.stringify(body) }
}

function accept(body: string, authorization: string | undefined): { status: number; body: string } {
  if (authorization !== `Bearer ${E2E_FAKE_MAIL_TOKEN}`) {
    return json({ error: 'bad token' }, 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body) as Record<string, unknown>
  } catch {
    return json({ error: 'not JSON' }, 400)
  }

  const to = typeof payload.to === 'string' ? payload.to : ''
  if (to === '') return json({ error: 'no recipient' }, 400)

  delivered.push({
    at: Date.now(),
    from: typeof payload.from === 'string' ? payload.from : '',
    to,
    subject: typeof payload.subject === 'string' ? payload.subject : '',
    text: typeof payload.text === 'string' ? payload.text : '',
    html: typeof payload.html === 'string' ? payload.html : null,
  })

  return json({ id: `mail_${delivered.length}` })
}

function inbox(to: string | null): { status: number; body: string } {
  const wanted = (to ?? '').trim().toLowerCase()
  const matching =
    wanted === '' ? delivered : delivered.filter((mail) => mail.to.toLowerCase().includes(wanted))

  return json({ mail: [...matching].reverse() })
}

const server = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${E2E_FAKE_MAIL_PORT}`)
    const method = request.method ?? 'GET'
    const body = Buffer.concat(chunks).toString('utf8')

    const answer =
      method === 'POST' && url.pathname === '/send'
        ? accept(body, request.headers.authorization)
        : method === 'GET' && url.pathname === '/inbox'
          ? inbox(url.searchParams.get('to'))
          : json({ error: `No fake for ${method} ${url.pathname}` }, 404)

    response.writeHead(answer.status, { 'content-type': 'application/json' })
    response.end(answer.body)
  })
})

server.listen(E2E_FAKE_MAIL_PORT, '127.0.0.1', () => {
  // biome-ignore lint/suspicious/noConsole: this is a process; its output is its status
  console.log(`fake mail listening on http://127.0.0.1:${E2E_FAKE_MAIL_PORT}`)
})
