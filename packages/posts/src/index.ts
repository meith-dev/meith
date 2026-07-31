/** @forum/posts — the thread-view read ports (F31) and the edit command (F41). */
export type { PostRepository } from './ports'
export type { PostListingRow, PostPage, QuotablePost } from './types'

export {
  PostEditor,
  editedNote,
  MESSAGE_MIN,
  type EditCapabilities,
  type EditablePost,
  type EditPostInput,
  type EditedPost,
  type PostEditRecord,
  type PostEditTarget,
  type PostEditorConfig,
  type PostVisibilityChange,
  type PostVisibilityRecord,
  type PostWriteRepository,
} from './edit'
