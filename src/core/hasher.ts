import { createHash } from 'crypto';
import { Readable } from 'stream';
import { hashComputationDurationHistogram } from '../util/metrics.js';

export interface HashResult {
  sha256: string;
  sizeBytes: number;
}

export class StreamingHasher {
  private hash = createHash('sha256');
  private sizeBytes = 0;

  constructor() {
    this.hash = createHash('sha256');
    this.sizeBytes = 0;
  }

  update(chunk: Buffer): void {
    this.hash.update(chunk);
    this.sizeBytes += chunk.length;
  }

  digest(): HashResult {
    const sha256 = this.hash.digest('hex').toLowerCase();
    return {
      sha256,
      sizeBytes: this.sizeBytes,
    };
  }

  reset(): void {
    this.hash = createHash('sha256');
    this.sizeBytes = 0;
  }
}

export async function computeHashFromStream(stream: Readable): Promise<HashResult> {
  const startTime = Date.now();
  
  try {
    const hasher = new StreamingHasher();
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        hasher.update(chunk);
      });
      
      stream.on('end', () => {
        const result = hasher.digest();
        const duration = (Date.now() - startTime) / 1000;
        hashComputationDurationHistogram.observe(duration);
        resolve(result);
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    hashComputationDurationHistogram.observe(duration);
    throw error;
  }
}

export async function computeHashFromBuffer(buffer: Buffer): Promise<HashResult> {
  const startTime = Date.now();
  
  try {
    const sha256 = createHash('sha256').update(buffer).digest('hex').toLowerCase();
    const duration = (Date.now() - startTime) / 1000;
    hashComputationDurationHistogram.observe(duration);
    
    return {
      sha256,
      sizeBytes: buffer.length,
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    hashComputationDurationHistogram.observe(duration);
    throw error;
  }
}

export function validateSha256Hash(hash: string): boolean {
  // SHA-256 hash should be 64 characters of lowercase hex
  return /^[a-f0-9]{64}$/.test(hash);
}

export function normalizeSha256Hash(hash: string): string {
  // Remove 0x prefix if present and convert to lowercase
  return hash.replace(/^0x/i, '').toLowerCase();
}
