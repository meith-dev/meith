/** The default `id` a page's `EditorToolbar` and the composer's textarea agree on. */
export const MESSAGE_TEXTAREA_ID = 'post-message'

export function attachmentFieldId(textareaId: string): string {
  return `${textareaId}-attachment`
}
