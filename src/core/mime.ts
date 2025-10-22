import { FileTypeResult } from 'file-type';
import { getConfig } from '../util/env.js';
import { UnsupportedMimeTypeError } from './errors.js';

const config = getConfig();

// Default allowed MIME types for evidence files
const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'application/octet-stream', // For unknown binary files
];

export function getAllowedMimeTypes(): string[] {
  // In a real implementation, this could be configurable
  return DEFAULT_ALLOWED_MIME_TYPES;
}

export function isAllowedMimeType(mimeType: string): boolean {
  const allowedTypes = getAllowedMimeTypes();
  return allowedTypes.includes(mimeType.toLowerCase());
}

export function validateMimeType(mimeType: string): void {
  if (!isAllowedMimeType(mimeType)) {
    throw new UnsupportedMimeTypeError(mimeType, getAllowedMimeTypes());
  }
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace potentially dangerous characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_') // Replace dangerous chars with underscore
    .replace(/\.\./g, '_') // Prevent directory traversal
    .replace(/^\.+/, '') // Remove leading dots
    .trim();
}

export function generateBucketKey(sha256: string, filename: string): string {
  // Create deterministic path: sha256/<first2>/<next2>/<hash>/filename
  const sanitizedFilename = sanitizeFilename(filename);
  return `sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}/${sanitizedFilename}`;
}

export function extractMimeFromFilename(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop();
  
  const mimeMap: Record<string, string> = {
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'csv': 'text/csv',
    'json': 'application/json',
    'zip': 'application/zip',
    'txt': 'text/plain',
  };
  
  return ext ? mimeMap[ext] || null : null;
}

export function getContentDisposition(filename: string): string {
  const sanitizedFilename = sanitizeFilename(filename);
  return `attachment; filename="${sanitizedFilename}"`;
}
