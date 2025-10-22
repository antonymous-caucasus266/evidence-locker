export class EvidenceLockerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EvidenceLockerError';
  }
}

export class ValidationError extends EvidenceLockerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends EvidenceLockerError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends EvidenceLockerError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends EvidenceLockerError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends EvidenceLockerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class StorageError extends EvidenceLockerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', 500, details);
    this.name = 'StorageError';
  }
}

export class HashMismatchError extends EvidenceLockerError {
  constructor(expected: string, actual: string) {
    super(
      `Hash mismatch: expected '${expected.slice(0, 8)}...' but got '${actual.slice(0, 8)}...'`,
      'HASH_MISMATCH',
      409,
      { expected: expected.slice(0, 8) + '...', actual: actual.slice(0, 8) + '...' }
    );
    this.name = 'HashMismatchError';
  }
}

export class UploadSessionExpiredError extends EvidenceLockerError {
  constructor(uploadId: string) {
    super(`Upload session '${uploadId}' has expired`, 'UPLOAD_SESSION_EXPIRED', 410);
    this.name = 'UploadSessionExpiredError';
  }
}

export class FileTooLargeError extends EvidenceLockerError {
  constructor(size: number, maxSize: number) {
    super(
      `File size ${size} bytes exceeds maximum allowed size of ${maxSize} bytes`,
      'FILE_TOO_LARGE',
      413,
      { size, maxSize }
    );
    this.name = 'FileTooLargeError';
  }
}

export class UnsupportedMimeTypeError extends EvidenceLockerError {
  constructor(mimeType: string, allowedTypes: string[]) {
    super(
      `MIME type '${mimeType}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      'UNSUPPORTED_MIME_TYPE',
      415,
      { mimeType, allowedTypes }
    );
    this.name = 'UnsupportedMimeTypeError';
  }
}

export class IPFSError extends EvidenceLockerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'IPFS_ERROR', 500, details);
    this.name = 'IPFSError';
  }
}
