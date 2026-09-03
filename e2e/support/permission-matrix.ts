import { expect, type Locator, type Page } from '@playwright/test'

export type MatrixOption = 'Inherit' | 'Grant' | 'Deny'

function matrixSection(page: Page, heading: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) })
}

async function matrixCell(
  page: Page,
  heading: string,
  rowText: string,
  groupTitle: string,
): Promise<Locator> {
  const table = matrixSection(page, heading).locator('table')
  const headers = await table.locator('thead th').allInnerTexts()
  const columnIndex = headers.indexOf(groupTitle)
  expect(columnIndex, `no "${groupTitle}" column under "${heading}"`).toBeGreaterThan(0)

  const row = table.locator('tbody tr').filter({ hasText: rowText })
  return row.locator('td').nth(columnIndex - 1)
}

export async function setMatrixCell(
  page: Page,
  heading: string,
  rowText: string,
  groupTitle: string,
  option: MatrixOption,
): Promise<void> {
  const cell = await matrixCell(page, heading, rowText, groupTitle)
  await cell.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await cell.getByText(option, { exact: true }).click()
}

export async function matrixCellRadio(
  page: Page,
  heading: string,
  rowText: string,
  groupTitle: string,
  option: MatrixOption,
): Promise<Locator> {
  const cell = await matrixCell(page, heading, rowText, groupTitle)
  return cell.getByRole('radio', { name: option, exact: true })
}

export async function saveMatrix(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save permissions' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.waitForLoadState('load')
}
