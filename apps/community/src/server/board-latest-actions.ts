'use server'

import { renderLatestPanels } from './board-latest'

export async function refreshLatestPanels(): Promise<React.ReactNode> {
  return renderLatestPanels()
}
