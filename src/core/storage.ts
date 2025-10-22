import AWS from 'aws-sdk';
import { Readable } from 'stream';
import { getConfig } from '../util/env.js';
import { StorageError } from './errors.js';

const config = getConfig();

export interface StorageDriver {
  putObject(key: string, stream: Readable, contentType: string, contentLength: number): Promise<void>;
  getObject(key: string): Promise<Readable>;
  getSignedUrl(operation: string, key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class S3StorageDriver implements StorageDriver {
  private s3: AWS.S3;

  constructor() {
    this.s3 = new AWS.S3({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
      s3ForcePathStyle: config.S3_FORCE_PATH_STYLE,
      signatureVersion: 'v4',
    });
  }

  async putObject(key: string, stream: Readable, contentType: string, contentLength: number): Promise<void> {
    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: stream,
        ContentType: contentType,
        ContentLength: contentLength,
        ServerSideEncryption: 'AES256',
      };

      await this.s3.upload(params).promise();
    } catch (error) {
      throw new StorageError(`Failed to upload object with key '${key}'`, { error: error.message });
    }
  }

  async getObject(key: string): Promise<Readable> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: config.S3_BUCKET,
        Key: key,
      };

      const result = await this.s3.getObject(params).promise();
      return Readable.from(result.Body as Buffer);
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        throw new StorageError(`Object with key '${key}' not found`, { error: error.message });
      }
      throw new StorageError(`Failed to get object with key '${key}'`, { error: error.message });
    }
  }

  async getSignedUrl(operation: string, key: string, expiresInSeconds: number = 300): Promise<string> {
    try {
      const params: AWS.S3.GetSignedUrlRequest = {
        Bucket: config.S3_BUCKET,
        Key: key,
        Expires: expiresInSeconds,
      };

      return this.s3.getSignedUrl(operation, params);
    } catch (error) {
      throw new StorageError(`Failed to generate signed URL for operation '${operation}' on key '${key}'`, { error: error.message });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      const params: AWS.S3.DeleteObjectRequest = {
        Bucket: config.S3_BUCKET,
        Key: key,
      };

      await this.s3.deleteObject(params).promise();
    } catch (error) {
      throw new StorageError(`Failed to delete object with key '${key}'`, { error: error.message });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const params: AWS.S3.HeadObjectRequest = {
        Bucket: config.S3_BUCKET,
        Key: key,
      };

      await this.s3.headObject(params).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw new StorageError(`Failed to check existence of object with key '${key}'`, { error: error.message });
    }
  }
}

export class LocalStorageDriver implements StorageDriver {
  private basePath: string;

  constructor(basePath: string = './storage') {
    this.basePath = basePath;
  }

  async putObject(key: string, stream: Readable, contentType: string, contentLength: number): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const filePath = path.join(this.basePath, key);
      const dirPath = path.dirname(filePath);
      
      await fs.mkdir(dirPath, { recursive: true });
      
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      
      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      
      const buffer = Buffer.concat(chunks);
      await fs.writeFile(filePath, buffer);
    } catch (error) {
      throw new StorageError(`Failed to store object locally with key '${key}'`, { error: error.message });
    }
  }

  async getObject(key: string): Promise<Readable> {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const filePath = path.join(this.basePath, key);
      return fs.createReadStream(filePath);
    } catch (error) {
      throw new StorageError(`Failed to read object with key '${key}'`, { error: error.message });
    }
  }

  async getSignedUrl(operation: string, key: string, expiresInSeconds: number = 300): Promise<string> {
    // For local storage, return a simple file URL
    // In production, you might want to implement a proper signed URL mechanism
    const baseUrl = process.env.LOCAL_STORAGE_BASE_URL || 'http://localhost:4600';
    return `${baseUrl}/files/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const filePath = path.join(this.basePath, key);
      await fs.unlink(filePath);
    } catch (error) {
      throw new StorageError(`Failed to delete object with key '${key}'`, { error: error.message });
    }
  }

  async exists(key: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const filePath = path.join(this.basePath, key);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export function createStorageDriver(): StorageDriver {
  // Use S3-compatible storage by default, fall back to local storage for development
  if (config.S3_ENDPOINT && config.S3_ACCESS_KEY && config.S3_SECRET_KEY) {
    return new S3StorageDriver();
  } else {
    console.warn('S3 configuration not found, using local storage driver');
    return new LocalStorageDriver();
  }
}
