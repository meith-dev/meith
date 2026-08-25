export async function freePort(): Promise<number> {
  const { createServer } = await import('node:net')
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => (port === 0 ? reject(new Error('no free port')) : resolve(port)))
    })
  })
}
