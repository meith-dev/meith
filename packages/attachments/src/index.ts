export { type Dimensions, declaredDimensions } from './dimensions'
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
  type AttachmentForDownload,
  type AttachmentRepository,
  AttachmentService,
  type AttachmentServiceDeps,
  acceptFile,
  acceptFiles,
  type CreateAttachmentInput,
  type ImageProcessor,
  isViewable,
  MAX_IMAGE,
  MAX_MEGAPIXELS,
  ORPHAN_GRACE_MINUTES,
  PROCESSING_GRACE_MINUTES,
  type ProcessedImage,
  type ReadyInput,
  type StagedUpload,
  THUMBNAIL,
  THUMBNAIL_THRESHOLD,
} from './service'
export {
  ACCEPTED_EXTENSIONS,
  type AcceptedUpload,
  ATTACHMENT_FIELD,
  ATTACHMENT_TYPES,
  type AttachmentHandling,
  type AttachmentRecord,
  type AttachmentStatus,
  type AttachmentType,
  attachmentType,
  type IncomingFile,
  MAGIC_BYTES_NEEDED,
  sniff,
} from './types'
