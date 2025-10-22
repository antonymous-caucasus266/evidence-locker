import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { createStorageDriver } from '../core/storage.js';
import { authenticateRequest, extractAuthFromHeaders, verifyJWT } from '../core/auth.js';
import { NotFoundError, AuthenticationError } from '../core/errors.js';
import { logger, logDownload } from '../util/logger.js';
import { downloadsCounter, downloadDurationHistogram } from '../util/metrics.js';
import { getConfig } from '../util/env.js';

const config = getConfig();

// Request schemas
const downloadParamsSchema = z.object({
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
});

const metadataParamsSchema = z.object({
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
});

export async function downloadRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const storage = createStorageDriver();

  // GET /v1/artifacts/:sha256Hex
  fastify.get('/:sha256Hex', {
    schema: {
      params: downloadParamsSchema,
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof downloadParamsSchema> }>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const { sha256Hex } = request.params;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
      });

      if (!artifact) {
        throw new NotFoundError('Artifact', sha256Hex);
      }

      // Check if public read is enabled
      if (config.PUBLIC_READ) {
        // Generate signed URL for public access
        const downloadUrl = await storage.getSignedUrl('getObject', artifact.bucketKey, 300); // 5 minutes
        
        logDownload(sha256Hex, artifact.filename, artifact.sizeBytes);
        downloadsCounter.inc({ org_id: 'public' });
        
        const duration = (Date.now() - startTime) / 1000;
        downloadDurationHistogram.observe(duration, { org_id: 'public' });

        reply.redirect(302, downloadUrl);
        return;
      }

      // Require authentication for private access
      let authContext;
      try {
        authContext = authenticateRequest(
          extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
          request.headers['x-app-sig'] as string,
          ''
        );
      } catch (authError) {
        // Try JWT authentication as fallback
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwtPayload = verifyJWT(token, 'evidence-locker');
          authContext = { appKey: 'jwt', orgId: jwtPayload.orgId, userId: jwtPayload.sub };
        } else {
          throw new AuthenticationError('Authentication required');
        }
      }

      // Generate signed URL for authenticated access
      const downloadUrl = await storage.getSignedUrl('getObject', artifact.bucketKey, 300); // 5 minutes
      
      logDownload(sha256Hex, artifact.filename, artifact.sizeBytes, authContext.orgId);
      downloadsCounter.inc({ org_id: authContext.orgId || 'unknown' });
      
      const duration = (Date.now() - startTime) / 1000;
      downloadDurationHistogram.observe(duration, { org_id: authContext.orgId || 'unknown' });

      reply.redirect(302, downloadUrl);

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      downloadDurationHistogram.observe(duration, { org_id: 'error' });
      
      if (error instanceof NotFoundError || error instanceof AuthenticationError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Download failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // GET /v1/artifacts/:sha256Hex/meta
  fastify.get('/:sha256Hex/meta', {
    schema: {
      params: metadataParamsSchema,
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof metadataParamsSchema> }>, reply: FastifyReply) => {
    try {
      const { sha256Hex } = request.params;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
      });

      if (!artifact) {
        throw new NotFoundError('Artifact', sha256Hex);
      }

      // Check authentication for metadata access
      let authContext;
      try {
        authContext = authenticateRequest(
          extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
          request.headers['x-app-sig'] as string,
          ''
        );
      } catch (authError) {
        // Try JWT authentication as fallback
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwtPayload = verifyJWT(token, 'evidence-locker');
          authContext = { appKey: 'jwt', orgId: jwtPayload.orgId, userId: jwtPayload.sub };
        } else {
          throw new AuthenticationError('Authentication required for metadata access');
        }
      }

      reply.send({
        artifactId: artifact.id,
        sha256Hex: artifact.sha256Hex,
        sizeBytes: artifact.sizeBytes,
        mime: artifact.mime,
        filename: artifact.filename,
        cidV1: artifact.cidV1,
        createdAt: artifact.createdAt,
        projectId: artifact.projectId,
        issuanceId: artifact.issuanceId,
        metaJson: artifact.metaJson,
      });

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthenticationError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Metadata retrieval failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });
}
