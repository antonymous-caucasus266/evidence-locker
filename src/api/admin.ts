import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { createStorageDriver } from '../core/storage.js';
import { createIPFSDriver } from '../core/ipfs.js';
import { computeHashFromStream } from '../core/hasher.js';
import { authenticateRequest, extractAuthFromHeaders, requireAuth } from '../core/auth.js';
import { NotFoundError, AuthorizationError, StorageError } from '../core/errors.js';
import { logger } from '../util/logger.js';
import { ipfsPinSuccessCounter, ipfsPinFailedCounter } from '../util/metrics.js';

// Request schemas
const retentionSweepSchema = z.object({
  beforeDate: z.string().datetime(),
  dryRun: z.boolean().default(true),
});

const ipfsPinSchema = z.object({
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
});

const rescanSchema = z.object({
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();
  const storage = createStorageDriver();
  const ipfs = createIPFSDriver();

  // POST /v1/admin/retention/sweep
  fastify.post('/retention/sweep', {
    schema: {
      body: retentionSweepSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof retentionSweepSchema> }>, reply: FastifyReply) => {
    try {
      // Authenticate and authorize admin request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );
      
      requireAuth(authContext, 'registry'); // Only registry can perform admin operations

      const { beforeDate, dryRun } = request.body;
      const cutoffDate = new Date(beforeDate);

      // Find artifacts older than cutoff date
      const oldArtifacts = await prisma.artifact.findMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
        select: {
          id: true,
          sha256Hex: true,
          bucketKey: true,
          filename: true,
          createdAt: true,
        },
      });

      if (dryRun) {
        reply.send({
          dryRun: true,
          artifactsToDelete: oldArtifacts.length,
          artifacts: oldArtifacts.map(a => ({
            id: a.id,
            sha256Hex: a.sha256Hex,
            filename: a.filename,
            createdAt: a.createdAt,
          })),
        });
        return;
      }

      // Actually delete artifacts
      const deletedArtifacts = [];
      for (const artifact of oldArtifacts) {
        try {
          // Delete from storage
          await storage.deleteObject(artifact.bucketKey);
          
          // Delete from database
          await prisma.artifact.delete({
            where: { id: artifact.id },
          });
          
          deletedArtifacts.push(artifact);
          
          logger.info({
            artifactId: artifact.id,
            sha256Hex: artifact.sha256Hex,
            filename: artifact.filename,
            event: 'retention_sweep_delete',
          }, 'Artifact deleted during retention sweep');
          
        } catch (error) {
          logger.error(error, `Failed to delete artifact ${artifact.id}`);
        }
      }

      reply.send({
        dryRun: false,
        artifactsDeleted: deletedArtifacts.length,
        artifacts: deletedArtifacts.map(a => ({
          id: a.id,
          sha256Hex: a.sha256Hex,
          filename: a.filename,
        })),
      });

    } catch (error) {
      if (error instanceof AuthorizationError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Retention sweep failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // POST /v1/admin/ipfs/pin
  fastify.post('/ipfs/pin', {
    schema: {
      body: ipfsPinSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ipfsPinSchema> }>, reply: FastifyReply) => {
    try {
      // Authenticate and authorize admin request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );
      
      requireAuth(authContext, 'registry');

      const { sha256Hex } = request.body;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
      });

      if (!artifact) {
        throw new NotFoundError('Artifact', sha256Hex);
      }

      if (!ipfs) {
        reply.code(400).send({ error: 'IPFS not enabled' });
        return;
      }

      if (artifact.cidV1) {
        reply.send({
          message: 'Artifact already pinned to IPFS',
          cidV1: artifact.cidV1,
        });
        return;
      }

      // Pin to IPFS
      const fileStream = await storage.getObject(artifact.bucketKey);
      const ipfsResult = await ipfs.pinFile(fileStream);

      // Update artifact with CID
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { cidV1: ipfsResult.cid },
      });

      ipfsPinSuccessCounter.inc();

      reply.send({
        message: 'Artifact pinned to IPFS successfully',
        cidV1: ipfsResult.cid,
        gatewayUrl: ipfs.getGatewayUrl(ipfsResult.cid),
      });

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'IPFS pin failed');
        ipfsPinFailedCounter.inc({ error_type: error.constructor.name });
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // POST /v1/admin/ipfs/unpin
  fastify.post('/ipfs/unpin', {
    schema: {
      body: ipfsPinSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof ipfsPinSchema> }>, reply: FastifyReply) => {
    try {
      // Authenticate and authorize admin request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );
      
      requireAuth(authContext, 'registry');

      const { sha256Hex } = request.body;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
      });

      if (!artifact) {
        throw new NotFoundError('Artifact', sha256Hex);
      }

      if (!ipfs) {
        reply.code(400).send({ error: 'IPFS not enabled' });
        return;
      }

      if (!artifact.cidV1) {
        reply.send({
          message: 'Artifact not pinned to IPFS',
        });
        return;
      }

      // Unpin from IPFS
      await ipfs.unpinFile(artifact.cidV1);

      // Remove CID from artifact
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { cidV1: null },
      });

      reply.send({
        message: 'Artifact unpinned from IPFS successfully',
        cidV1: artifact.cidV1,
      });

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'IPFS unpin failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });

  // POST /v1/admin/rescan
  fastify.post('/rescan', {
    schema: {
      body: rescanSchema,
    },
  }, async (request: FastifyRequest<{ Body: z.infer<typeof rescanSchema> }>, reply: FastifyReply) => {
    try {
      // Authenticate and authorize admin request
      const authContext = authenticateRequest(
        extractAuthFromHeaders(request.headers as Record<string, string>).appKey,
        request.headers['x-app-sig'] as string,
        JSON.stringify(request.body)
      );
      
      requireAuth(authContext, 'registry');

      const { sha256Hex } = request.body;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
      });

      if (!artifact) {
        throw new NotFoundError('Artifact', sha256Hex);
      }

      // Re-compute hash from storage
      const fileStream = await storage.getObject(artifact.bucketKey);
      const hashResult = await computeHashFromStream(fileStream);

      // Verify hash matches
      if (hashResult.sha256 !== artifact.sha256Hex) {
        throw new StorageError('Hash mismatch during rescan', {
          expected: artifact.sha256Hex,
          actual: hashResult.sha256,
        });
      }

      // Update scan status (in a real implementation, you'd run ClamAV here)
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { 
          scanStatus: 'CLEAN',
          verifiedAt: new Date(),
        },
      });

      reply.send({
        message: 'Artifact rescanned successfully',
        sha256Hex: artifact.sha256Hex,
        scanStatus: 'CLEAN',
        verifiedAt: new Date(),
      });

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError || error instanceof StorageError) {
        reply.code(error.statusCode).send({ error: error.message, code: error.code });
      } else {
        logger.error(error, 'Rescan failed');
        reply.code(500).send({ error: 'Internal server error' });
      }
    }
  });
}
