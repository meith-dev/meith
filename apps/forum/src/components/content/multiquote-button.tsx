'use client'

export function MultiQuoteButton({ author, message }: { author: string; message: string }) {
  return <button type="button" onClick={() => {
    const quotes = JSON.parse(sessionStorage.getItem('multiquote') ?? '[]') as Array<{ author: string; message: string }>
    sessionStorage.setItem('multiquote', JSON.stringify([...quotes, { author, message }]))
  }}>Multi-quote</button>
}
