export type TmErrorCode =
  | "TM_PROJECT_NOT_FOUND"
  | "TM_CHECKPOINT_NOT_FOUND"
  | "TM_MANIFEST_CORRUPT"
  | "TM_BLOB_MISSING"
  | "TM_PATH_ESCAPE"
  | "TM_PERMISSION_DENIED"
  | "TM_IO_ERROR"
  | "TM_CONFLICT_LOCKED"
  | "TM_TOO_LARGE"
  | "TM_CAPSULE_NOT_AVAILABLE"
  | "TM_CAPSULE_EXEC_FAILED"
  | "TM_CAPSULE_IMAGE_DIGEST_FAILED"
  | "TM_INVALID_INPUT"
  | "TM_INVALID_ARGUMENT"
  | "TM_FILE_NOT_FOUND"
  | "TM_INVALID_INDEX"
  | "TM_NO_STASH"
  | "TM_TAG_NOT_FOUND"
  | "TM_NO_CHECKPOINT"
  | "TM_TAG_EXISTS"
  | "TM_INVALID_OPERATION";

export class TmError extends Error {
  constructor(
    public code: TmErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TmError";
  }
}
