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
