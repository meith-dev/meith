export async function rejectionMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected the promise to reject, but it resolved')
}
