export const MESSAGE_TEXTAREA_ID = 'post-message'

export function attachmentFieldId(textareaId: string): string {
  return `${textareaId}-attachment`
}
