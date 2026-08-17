import { renderErrorNotice } from '@/server/error-notice'
import { NOT_FOUND_NOTICE } from '@/view/error-notice'

export default async function NotFound() {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex flex-1 items-center justify-center px-6 py-12"
    >
      {await renderErrorNotice(NOT_FOUND_NOTICE)}
    </main>
  )
}
