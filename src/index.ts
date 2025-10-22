import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, parseCorsAllowlist } from './util/env.js';
import { logger } from './util/logger.js';
import { registry } from './util/metrics.js';
import { disconnectPrisma } from './db/prisma.js';
import { uploadRoutes } from './api/upload.js';
import { downloadRoutes } from './api/download.js';
import { verifyRoutes } from './api/verify.js';
import { adminRoutes } from './api/admin.js';

// Load configuration
const config = loadConfig();

// Create Fastify instance
const fastify = Fastify({
  logger: logger,
  trustProxy: true,
});

// Register plugins
await fastify.register(helmet, {
  contentSecurityPolicy: false, // Disable CSP for API
});

await fastify.register(cors, {
  origin: parseCorsAllowlist(),
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    return request.headers['x-app-key'] as string || request.ip;
  },
});

// Health check endpoints
fastify.get('/health', async (request, reply) => {
  try {
    // Check database connectivity
    const { getPrismaClient } = await import('./db/prisma.js');
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (error) {
    reply.code(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    });
  }
});

fastify.get('/ready', async (request, reply) => {
  reply.send({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  reply.send(await registry.metrics());
});

// API routes
await fastify.register(uploadRoutes, { prefix: '/v1/upload' });
await fastify.register(downloadRoutes, { prefix: '/v1/artifacts' });
await fastify.register(verifyRoutes, { prefix: '/v1/artifacts' });
await fastify.register(adminRoutes, { prefix: '/v1/admin' });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  logger.error(error, 'Unhandled error');
  
  if (error.validation) {
    reply.code(400).send({
      error: 'Validation error',
      details: error.validation,
    });
    return;
  }
  
  reply.code(500).send({
    error: 'Internal server error',
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    await fastify.close();
    await disconnectPrisma();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    const address = await fastify.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });
    
    logger.info(`Evidence Locker server listening at ${address}`);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

start();
