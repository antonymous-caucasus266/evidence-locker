import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { createStorageDriver } from '../core/storage.js';
import { createIPFSDriver } from '../core/ipfs.js';
import { computeHashFromStream, validateSha256Hash, normalizeSha256Hash } from '../core/hasher.js';
import { generateBucketKey, sanitizeFilename, validateMimeType, extractMimeFromFilename } from '../core/mime.js';
import { authenticateRequest, extractAuthFromHeaders } from '../core/auth.js';
import { 
  ValidationError, 
  NotFoundError, 
  HashMismatchError, 
  UploadSessionExpiredError,
  FileTooLargeError,
  UnsupportedMimeTypeError,
  StorageError
} from '../core/errors.js';
import { logger, logUploadInit, logUploadComplete, logUploadError } from '../util/logger.js';
import { 
  uploadInitiatedCounter, 
  uploadCompletedCounter, 
  uploadFailedCounter,
  deduplicationCounter,
  ipfsPinSuccessCounter,
  ipfsPinFailedCounter,
  uploadDurationHistogram
} from '../util/metrics.js';
import { getConfig } from '../util/env.js';

const config = getConfig();

// Request schemas
const uploadInitSchema = z.object({
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().positive().optional(),
  mimeHint: z.string().optional(),
  declaredSha256: z.string().optional(),
  context: z.object({
    projectId: z.string().optional(),
    issuanceId: z.string().optional(),
    label: z.string().optional(),
  }).optional(),
});

const uploadCompleteSchema = z.object({
  uploadId: z.string().min(1),
});

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const storage = createStorageDriver();
  const ipfs = createIPFSDriver();

  // POST /v1/upload/init
  fastify.post('/init', {
    schema: {
      body: uploadInitSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof uploadInitSchema> }>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      // Authenticate request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );

      const { filename, sizeBytes, mimeHint, declaredSha256, context } = request.body;

      // Validate file size
      if (sizeBytes && sizeBytes > config.MAX_UPLOAD_BYTES) {
        throw new FileTooLargeError(sizeBytes, config.MAX_UPLOAD_BYTES);
      }

      // Validate declared hash if provided
      if (declaredSha256 && !validateSha256Hash(normalizeSha256Hash(declaredSha256))) {
        throw new ValidationError('Invalid SHA-256 hash format');
      }

      // Validate MIME type hint
      if (mimeHint) {
        validateMimeType(mimeHint);
      }

      // Generate upload session
      const uploadId = crypto.randomUUID();
      const bucketKey = declaredSha256 
        ? generateBucketKey(normalizeSha256Hash(declaredSha256), filename)
        : generateBucketKey(crypto.randomUUID(), filename);

      const uploadSession = await prisma.uploadSession.create({
        data: {
          id: uploadId,
          sha256Hex: declaredSha256 ? normalizeSha256Hash(declaredSha256) : null,
          filename: sanitizeFilename(filename),
          expectedSize: sizeBytes,
          mimeHint: mimeHint || extractMimeFromFilename(filename),
          uploaderOrgId: authContext.orgId,
          token: crypto.randomUUID(),
          bucketKey,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        },
      });

      // Generate signed URL (simplified for demo)
      const putUrl = `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${bucketKey}`;

      logUploadInit(uploadId, filename, sizeBytes, authContext.orgId);
      uploadInitiatedCounter.inc({ org_id: authContext.orgId || 'unknown' });

      reply.code(201).send({
        uploadId,
        token: uploadSession.token,
        putUrl,
        bucketKey,
        expiresAt: uploadSession.expiresAt,
      });

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      uploadDurationHistogram.observe(duration);
      
      if (error instanceof ValidationError || error instanceof FileTooLargeError || error instanceof UnsupportedMimeTypeError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Upload init failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // POST /v1/upload/complete
  fastify.post('/complete', {
    schema: {
      body: uploadCompleteSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof uploadCompleteSchema> }>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      // Authenticate request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );

      const { uploadId } = request.body;

      // Get upload session
      const uploadSession = await prisma.uploadSession.findUnique({
        where: { id: uploadId },
      });

      if (!uploadSession) {
        throw new NotFoundError('Upload session', uploadId);
      }

      if (uploadSession.expiresAt < new Date()) {
        throw new UploadSessionExpiredError(uploadId);
      }

      if (!uploadSession.bucketKey) {
        throw new ValidationError('Upload session missing bucket key');
      }

      // Get file from storage
      const fileStream = await storage.getObject(uploadSession.bucketKey);
      
      // Compute hash and validate
      const hashResult = await computeHashFromStream(fileStream);
      
      // Check for hash mismatch if declared
      if (uploadSession.sha256Hex && uploadSession.sha256Hex !== hashResult.sha256) {
        await prisma.uploadSession.update({
          where: { id: uploadId },
          data: { status: 'ABORTED' },
        });
        
        throw new HashMismatchError(uploadSession.sha256Hex, hashResult.sha256);
      }

      // Check for existing artifact with same hash (deduplication)
      let artifact = await prisma.artifact.findUnique({
        where: { sha256Hex: hashResult.sha256 },
      });

      if (artifact) {
        // Deduplication hit
        deduplicationCounter.inc();
        
        await prisma.uploadSession.update({
          where: { id: uploadId },
          data: { 
            status: 'COMPLETE',
            completedAt: new Date(),
          },
        });

        logUploadComplete(uploadId, artifact.id, hashResult.sha256, hashResult.sizeBytes, artifact.mime, authContext.orgId);
        uploadCompletedCounter.inc({ org_id: authContext.orgId || 'unknown', mime_type: artifact.mime });

        reply.send({
          artifactId: artifact.id,
          sha256Hex: artifact.sha256Hex,
          sizeBytes: artifact.sizeBytes,
          mime: artifact.mime,
          bucketKey: artifact.bucketKey,
          cidV1: artifact.cidV1,
          downloadUrl: `/v1/artifacts/${artifact.sha256Hex}`,
        });
        return;
      }

      // Create new artifact
      artifact = await prisma.artifact.create({
        data: {
          sha256Hex: hashResult.sha256,
          sizeBytes: hashResult.sizeBytes,
          mime: uploadSession.mimeHint || 'application/octet-stream',
          filename: uploadSession.filename,
          bucketKey: uploadSession.bucketKey,
          uploaderOrgId: authContext.orgId,
          projectId: uploadSession.projectId,
          issuanceId: uploadSession.issuanceId,
          verifiedAt: new Date(),
        },
      });

      // Optional IPFS pinning
      let cidV1: string | undefined;
      if (ipfs) {
        try {
          const fileStreamForIPFS = await storage.getObject(uploadSession.bucketKey);
          const ipfsResult = await ipfs.pinFile(fileStreamForIPFS);
          
          await prisma.artifact.update({
            where: { id: artifact.id },
            data: { cidV1: ipfsResult.cid },
          });
          
          cidV1 = ipfsResult.cid;
          ipfsPinSuccessCounter.inc();
        } catch (error) {
          logger.warn(error, 'IPFS pinning failed');
          ipfsPinFailedCounter.inc({ error_type: error.constructor.name });
        }
      }

      // Update upload session
      await prisma.uploadSession.update({
        where: { id: uploadId },
        data: { 
          status: 'COMPLETE',
          completedAt: new Date(),
        },
      });

      const duration = (Date.now() - startTime) / 1000;
      uploadDurationHistogram.observe(duration);

      logUploadComplete(uploadId, artifact.id, hashResult.sha256, hashResult.sizeBytes, artifact.mime, authContext.orgId);
      uploadCompletedCounter.inc({ org_id: authContext.orgId || 'unknown', mime_type: artifact.mime });

      reply.send({
        artifactId: artifact.id,
        sha256Hex: artifact.sha256Hex,
        sizeBytes: artifact.sizeBytes,
        mime: artifact.mime,
        bucketKey: artifact.bucketKey,
        cidV1,
        downloadUrl: `/v1/artifacts/${artifact.sha256Hex}`,
      });

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      uploadDurationHistogram.observe(duration);
      
      if (error instanceof NotFoundError || error instanceof UploadSessionExpiredError || error instanceof HashMismatchError) {
        logUploadError(request.body.uploadId, error.message, extractAuthFromHeaders(request.headers as Record<string, string>).orgId);
        uploadFailedCounter.inc({ 
          org_id: extractAuthFromHeaders(request.headers as Record<string, string>).orgId || 'unknown',
          error_type: error.constructor.name 
        });
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Upload complete failed');
        uploadFailedCounter.inc({ 
          org_id: extractAuthFromHeaders(request.headers as Record<string, string>).orgId || 'unknown',
          error_type: 'INTERNAL_ERROR'
        });
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });
}
