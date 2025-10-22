import pino from 'pino';
import { getConfig } from './env.js';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

// Helper function to redact sensitive information from logs
export function redactHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

// Helper function to redact token information
export function redactToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

// Structured logging helpers
export function logUploadInit(uploadId: string, filename: string, sizeBytes?: number, orgId?: string) {
  logger.info({
    uploadId,
    filename,
    sizeBytes,
    orgId,
    event: 'upload_init',
  }, 'Upload session initialized');
}

export function logUploadComplete(uploadId: string, artifactId: string, sha256: string, sizeBytes: number, mime: string, orgId?: string) {
  logger.info({
    uploadId,
    artifactId,
    sha256: redactHash(sha256),
    sizeBytes,
    mime,
    orgId,
    event: 'upload_complete',
  }, 'Upload completed successfully');
}

export function logUploadError(uploadId: string, error: string, orgId?: string) {
  logger.error({
    uploadId,
    error,
    orgId,
    event: 'upload_error',
  }, 'Upload failed');
}

export function logDownload(sha256: string, filename: string, sizeBytes: number, orgId?: string) {
  logger.info({
    sha256: redactHash(sha256),
    filename,
    sizeBytes,
    orgId,
    event: 'download',
  }, 'File downloaded');
}

export function logVerify(sha256: string, exists: boolean, orgId?: string) {
  logger.info({
    sha256: redactHash(sha256),
    exists,
    orgId,
    event: 'verify',
  }, 'File verification requested');
}
