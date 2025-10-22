import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../db/prisma.js';
import { NotFoundError } from '../core/errors.js';
import { logger, logVerify } from '../util/logger.js';
import { verificationsCounter } from '../util/metrics.js';

// Request schemas
const verifyParamsSchema = z.object({
  sha256Hex: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid SHA-256 hash format'),
});

export async function verifyRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = getPrismaClient();

  // GET /v1/artifacts/:sha256Hex/verify
  fastify.get('/:sha256Hex/verify', {
    schema: {
      params: verifyParamsSchema,
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof verifyParamsSchema> }>, reply: FastifyReply) => {
    try {
      const { sha256Hex } = request.params;

      // Get artifact
      const artifact = await prisma.artifact.findUnique({
        where: { sha256Hex },
        select: {
          id: true,
          sha256Hex: true,
          sizeBytes: true,
          mime: true,
          cidV1: true,
          createdAt: true,
          scanStatus: true,
        },
      });

      const exists = !!artifact;
      
      logVerify(sha256Hex, exists);
      verificationsCounter.inc({ exists: exists.toString() });

      if (!exists) {
        reply.send({
          exists: false,
        });
        return;
      }

      reply.send({
        exists: true,
        sizeBytes: artifact.sizeBytes,
        mime: artifact.mime,
        cidV1: artifact.cidV1,
        createdAt: artifact.createdAt,
        scanStatus: artifact.scanStatus,
      });

    } catch (error) {
      logger.error(error, 'Verification failed');
      reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
