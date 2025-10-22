import { createHmac, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getConfig, parseAppKeys } from '../util/env.js';
import { AuthenticationError, AuthorizationError } from './errors.js';

const config = getConfig();

export interface AuthContext {
  appKey: string;
  orgId?: string;
  userId?: string;
}

export interface JWTPayload {
  sub: string;
  aud: string;
  orgId?: string;
  iat: number;
  exp: number;
}

export function generateHMACSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyHMACSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = generateHMACSignature(body, secret);
  return createHmac('sha256', secret).update(body).digest('hex') === signature;
}

export function authenticateRequest(appKey: string, signature: string, body: string): AuthContext {
  const appKeys = parseAppKeys();
  
  if (!appKeys[appKey]) {
    throw new AuthenticationError(`Invalid app key: ${appKey}`);
  }
  
  const secret = appKeys[appKey];
  
  if (!verifyHMACSignature(body, signature, secret)) {
    throw new AuthenticationError('Invalid signature');
  }
  
  return {
    appKey,
  };
}

export function generateUploadToken(uploadId: string, expiresInMinutes: number = 5): string {
  const payload = {
    uploadId,
    type: 'upload',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresInMinutes * 60),
  };
  
  // Use a random secret for upload tokens (in production, use a proper secret)
  const secret = randomBytes(32).toString('hex');
  return jwt.sign(payload, secret);
}

export function verifyUploadToken(token: string): { uploadId: string } {
  try {
    // In production, you'd store and verify the secret properly
    const decoded = jwt.decode(token) as any;
    
    if (!decoded || decoded.type !== 'upload') {
      throw new AuthenticationError('Invalid upload token');
    }
    
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new AuthenticationError('Upload token expired');
    }
    
    return { uploadId: decoded.uploadId };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Invalid upload token');
  }
}

export function generateJWT(payload: Partial<JWTPayload>, expiresInHours: number = 24): string {
  if (!config.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    sub: payload.sub || '',
    aud: payload.aud || 'evidence-locker',
    orgId: payload.orgId,
    iat: now,
    exp: now + (expiresInHours * 3600),
  };
  
  return jwt.sign(fullPayload, config.JWT_SECRET);
}

export function verifyJWT(token: string, expectedAudience?: string): JWTPayload {
  if (!config.JWT_SECRET) {
    throw new AuthenticationError('JWT verification not configured');
  }
  
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    if (expectedAudience && payload.aud !== expectedAudience) {
      throw new AuthenticationError(`Invalid audience: expected ${expectedAudience}, got ${payload.aud}`);
    }
    
    return payload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError(`JWT verification failed: ${error.message}`);
    }
    throw error;
  }
}

export function requireAuth(authContext: AuthContext, requiredApp?: string): void {
  if (requiredApp && authContext.appKey !== requiredApp) {
    throw new AuthorizationError(`Access denied: required app '${requiredApp}', got '${authContext.appKey}'`);
  }
}

export function extractAuthFromHeaders(headers: Record<string, string | undefined>): AuthContext {
  const appKey = headers['x-app-key'];
  const signature = headers['x-app-sig'];
  
  if (!appKey || !signature) {
    throw new AuthenticationError('Missing authentication headers (x-app-key, x-app-sig)');
  }
  
  return { appKey };
}
