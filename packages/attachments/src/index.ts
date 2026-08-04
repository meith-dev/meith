/**
 * `@meith/attachments` — F42.
 *
 * The domain half of attachments: what the board accepts, what it does to it,
 * and in what order. No SQL, no HTTP, no codec — `@meith/db` provides the
 * repository, the app provides the route handlers, and `@meith/drivers/images`
 * provides the `ImageProcessor`.
 *
 * The one idea worth carrying out of here: **an upload is not made safe by
 * being validated, it is made safe by being re-encoded**. Everything in
 * `service.ts` is arranged around that — the two storage keys, the `pending`
 * status, the queued job, and the fact that nothing is downloadable until the
 * job has succeeded. See ADR 0003.
 */
export {
  ACCEPTED_EXTENSIONS,
  ATTACHMENT_FIELD,
  ATTACHMENT_TYPES,
  MAGIC_BYTES_NEEDED,
  attachmentType,
  sniff,
  type AcceptedUpload,
  type AttachmentHandling,
  type AttachmentRecord,
  type AttachmentStatus,
  type AttachmentType,
  type IncomingFile,
} from './types'

export { declaredDimensions, type Dimensions } from './dimensions'

export {
  MAX_FILENAME_LENGTH,
  sanitiseFilename,
  storageKeyFor,
} from './filename'

export {
  HARD_MAX_BYTES,
  HARD_MAX_PER_POST,
  maxBytesFor,
  maxPerPostFor,
  type UploadLimits,
} from './limits'

export {
  AttachmentService,
  MAX_IMAGE,
  MAX_MEGAPIXELS,
  ORPHAN_GRACE_MINUTES,
  PROCESSING_GRACE_MINUTES,
  THUMBNAIL,
  THUMBNAIL_THRESHOLD,
  acceptFile,
  acceptFiles,
  isViewable,
  type AttachmentForDownload,
  type AttachmentRepository,
  type AttachmentServiceDeps,
  type CreateAttachmentInput,
  type ImageProcessor,
  type ProcessedImage,
  type ReadyInput,
  type StagedUpload,
} from './service'
