import { randomBytes } from 'crypto';
import { getConfig } from '../util/env.js';
import { generateUploadToken } from './auth.js';

const config = getConfig();

export interface SignedUploadUrl {
  uploadId: string;
  token: string;
  putUrl: string;
  bucketKey: string;
  expiresAt: Date;
}

export function generateUploadId(): string {
  return randomBytes(16).toString('hex');
}

export function generateBucketKey(sha256: string, filename: string): string {
  // Create deterministic path: sha256/<first2>/<next2>/<hash>/filename
  const sanitizedFilename = filename.replace(/[<>:"/\\|?*]/g, '_');
  return `sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}/${sanitizedFilename}`;
}

export function createSignedUploadUrl(
  uploadId: string,
  bucketKey: string,
  contentType: string,
  contentLength: number,
  expiresInMinutes: number = 5
): SignedUploadUrl {
  const expiresAt = new Date(Date.now() + (expiresInMinutes * 60 * 1000));
  const token = generateUploadToken(uploadId, expiresInMinutes);
  
  // For now, return a placeholder URL. In a real implementation, this would
  // generate a proper signed URL using the storage driver
  const putUrl = `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${bucketKey}`;
  
  return {
    uploadId,
    token,
    putUrl,
    bucketKey,
    expiresAt,
  };
}
