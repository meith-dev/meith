export const PROGRESSIVE_FIELD = 'clientEnhanced'

export function isEnhancedSubmit(form: FormData): boolean {
  return form.get(PROGRESSIVE_FIELD) === '1'
}
