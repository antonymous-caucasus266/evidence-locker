import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(4600),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // S3 Storage
  S3_ENDPOINT: z.string().url().default('http://minio:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('evidence'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  
  // Security
  PUBLIC_READ: z.coerce.boolean().default(false),
  MAX_UPLOAD_BYTES: z.coerce.number().default(52428800), // 50MB
  HMAC_APP_KEYS: z.string().min(1, 'HMAC_APP_KEYS is required'),
  CORS_ALLOWLIST: z.string().default(''),
  JWT_SECRET: z.string().optional(),
  
  // IPFS (Optional)
  IPFS_ENABLED: z.coerce.boolean().default(false),
  IPFS_API_URL: z.string().url().optional(),
  
  // Scanning (Optional)
  ENABLE_CLAMAV: z.coerce.boolean().default(false),
  CLAMAV_HOST: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

export function loadConfig(): Config {
  if (!config) {
    try {
      config = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Configuration validation failed:');
        error.errors.forEach((err) => {
          console.error(`  ${err.path.join('.')}: ${err.message}`);
        });
        process.exit(1);
      }
      throw error;
    }
  }
  return config;
}

export function getConfig(): Config {
  return config || loadConfig();
}

// Parse HMAC app keys from environment
export function parseAppKeys(): Record<string, string> {
  const config = getConfig();
  const keys: Record<string, string> = {};
  
  config.HMAC_APP_KEYS.split(',').forEach((pair) => {
    const [app, key] = pair.split(':');
    if (app && key) {
      keys[app.trim()] = key.trim();
    }
  });
  
  return keys;
}

// Parse CORS allowlist from environment
export function parseCorsAllowlist(): string[] {
  const config = getConfig();
  if (!config.CORS_ALLOWLIST) return [];
  
  return config.CORS_ALLOWLIST.split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}
