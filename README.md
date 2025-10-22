# Evidence Locker

A content-addressed evidence storage and integrity service designed for carbon credit verification systems. The Evidence Locker provides secure, immutable storage for evidence files with cryptographic integrity guarantees.

## Features

- **Content-Addressed Storage**: Files are stored and referenced by their SHA-256 hash
- **Signed URL Uploads**: Secure browser-to-storage uploads with server-side verification
- **Deduplication**: Automatic deduplication based on content hash
- **IPFS Integration**: Optional IPFS pinning for decentralized storage
- **HMAC Authentication**: Secure machine-to-machine authentication
- **MIME Type Validation**: Configurable MIME type allowlist
- **Prometheus Metrics**: Built-in observability and monitoring
- **Docker Support**: Complete containerized deployment

## Architecture

The Evidence Locker consists of:

- **API Layer**: Fastify-based REST API with TypeScript
- **Storage Layer**: S3-compatible storage (MinIO) with local filesystem fallback
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: HMAC-based app keys for server-to-server communication
- **Integrity**: SHA-256 hashing with streaming computation
- **Optional IPFS**: Kubo node or pinning service integration

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 16+ (if running locally)
- MinIO or S3-compatible storage

### Docker Deployment

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd evidence-locker
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Initialize database**:
   ```bash
   docker-compose exec evidence-locker npx prisma db push
   docker-compose exec evidence-locker npm run db:seed
   ```

4. **Create sample files**:
   ```bash
   ./scripts/create-samples.sh
   ```

5. **Run demo**:
   ```bash
   ./scripts/demo-upload.sh
   ```

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup environment**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start database and storage**:
   ```bash
   docker-compose up -d postgres minio
   ```

4. **Initialize database**:
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4600` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `S3_ENDPOINT` | S3-compatible storage endpoint | `http://minio:9000` |
| `S3_BUCKET` | Storage bucket name | `evidence` |
| `S3_ACCESS_KEY` | Storage access key | Required |
| `S3_SECRET_KEY` | Storage secret key | Required |
| `PUBLIC_READ` | Enable public read access | `false` |
| `MAX_UPLOAD_BYTES` | Maximum file size | `52428800` (50MB) |
| `HMAC_APP_KEYS` | Comma-separated app keys | Required |
| `IPFS_ENABLED` | Enable IPFS integration | `false` |
| `IPFS_API_URL` | IPFS API endpoint | Optional |

### HMAC App Keys

Configure trusted applications with HMAC keys:

```bash
HMAC_APP_KEYS=registry:secret1,issuer-portal:secret2,verifier-console:secret3
```

## API Reference

### Authentication

All server-to-server requests require HMAC authentication:

```bash
x-app-key: registry
x-app-sig: <HMAC-SHA256(body, secret)>
```

### Upload Flow

#### 1. Initialize Upload

```http
POST /v1/upload/init
Content-Type: application/json
x-app-key: registry
x-app-sig: <signature>

{
  "filename": "evidence.pdf",
  "sizeBytes": 1024,
  "mimeHint": "application/pdf",
  "declaredSha256": "abc123...",
  "context": {
    "projectId": "project-123",
    "issuanceId": "issuance-456"
  }
}
```

**Response:**
```json
{
  "uploadId": "upload-123",
  "token": "token-456",
  "putUrl": "https://storage.example.com/...",
  "bucketKey": "sha256/ab/c1/abc123.../evidence.pdf",
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

#### 2. Upload File

```http
PUT <putUrl>
Content-Type: application/pdf
Content-Length: 1024

<file bytes>
```

#### 3. Complete Upload

```http
POST /v1/upload/complete
Content-Type: application/json
x-app-key: registry
x-app-sig: <signature>

{
  "uploadId": "upload-123"
}
```

**Response:**
```json
{
  "artifactId": "artifact-789",
  "sha256Hex": "abc123...",
  "sizeBytes": 1024,
  "mime": "application/pdf",
  "bucketKey": "sha256/ab/c1/abc123.../evidence.pdf",
  "cidV1": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "downloadUrl": "/v1/artifacts/abc123..."
}
```

### Download

#### Public Download (if enabled)

```http
GET /v1/artifacts/{sha256Hex}
```

#### Authenticated Download

```http
GET /v1/artifacts/{sha256Hex}
x-app-key: registry
x-app-sig: <signature>
```

**Response:** `302 Redirect` to signed storage URL

### Verification

```http
GET /v1/artifacts/{sha256Hex}/verify
```

**Response:**
```json
{
  "exists": true,
  "sizeBytes": 1024,
  "mime": "application/pdf",
  "cidV1": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "createdAt": "2024-01-01T12:00:00Z",
  "scanStatus": "CLEAN"
}
```

### Metadata

```http
GET /v1/artifacts/{sha256Hex}/meta
x-app-key: registry
x-app-sig: <signature>
```

**Response:**
```json
{
  "artifactId": "artifact-789",
  "sha256Hex": "abc123...",
  "sizeBytes": 1024,
  "mime": "application/pdf",
  "filename": "evidence.pdf",
  "cidV1": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "createdAt": "2024-01-01T12:00:00Z",
  "projectId": "project-123",
  "issuanceId": "issuance-456",
  "metaJson": {}
}
```

### Admin Operations

#### Retention Sweep

```http
POST /v1/admin/retention/sweep
x-app-key: registry
x-app-sig: <signature>

{
  "beforeDate": "2023-01-01T00:00:00Z",
  "dryRun": true
}
```

#### IPFS Pin

```http
POST /v1/admin/ipfs/pin
x-app-key: registry
x-app-sig: <signature>

{
  "sha256Hex": "abc123..."
}
```

#### IPFS Unpin

```http
POST /v1/admin/ipfs/unpin
x-app-key: registry
x-app-sig: <signature>

{
  "sha256Hex": "abc123..."
}
```

#### Rescan

```http
POST /v1/admin/rescan
x-app-key: registry
x-app-sig: <signature>

{
  "sha256Hex": "abc123..."
}
```

## Health Checks

### Health Endpoint

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0"
}
```

### Readiness Endpoint

```http
GET /ready
```

### Metrics Endpoint

```http
GET /metrics
```

**Response:** Prometheus metrics in text format

## Client Integration

### Browser Upload Flow

1. **Client requests upload** from your backend
2. **Backend calls** `/v1/upload/init` with HMAC auth
3. **Backend returns** `putUrl` and `uploadId` to client
4. **Client uploads** file directly to `putUrl`
5. **Backend calls** `/v1/upload/complete` to verify
6. **Backend stores** returned `sha256Hex` and `cidV1`

### Example Client Code

```javascript
// 1. Request upload from your backend
const uploadResponse = await fetch('/api/upload/init', {
  method: 'POST',
  body: JSON.stringify({
    filename: file.name,
    sizeBytes: file.size,
    mimeHint: file.type
  })
});

const { putUrl, uploadId } = await uploadResponse.json();

// 2. Upload file directly to storage
await fetch(putUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
    'Content-Length': file.size
  }
});

// 3. Complete upload via your backend
const completeResponse = await fetch('/api/upload/complete', {
  method: 'POST',
  body: JSON.stringify({ uploadId })
});

const { sha256Hex, cidV1 } = await completeResponse.json();
```

## Security

### Authentication

- **HMAC-SHA256** signatures for all server-to-server requests
- **Short-lived upload tokens** (5 minutes) for browser uploads
- **JWT tokens** for optional user authentication

### File Validation

- **MIME type allowlist** (configurable)
- **File size limits** (default 50MB)
- **SHA-256 verification** on all uploads
- **Content-type sniffing** to prevent MIME spoofing

### Storage Security

- **Content-addressed storage** prevents tampering
- **Immutable objects** - never overwrite existing content
- **Signed URLs** for secure access
- **CORS allowlist** for browser security

## Monitoring

### Metrics

- Upload initiated/completed/failed counters
- Bytes stored and artifacts count
- Deduplication hit rate
- IPFS pin success/failure rate
- Upload/download duration histograms

### Logging

- Structured JSON logs with correlation IDs
- Redacted sensitive information (hashes, tokens)
- Upload/download event tracking
- Error logging with context

## Development

### Project Structure

```
evidence-locker/
├── src/
│   ├── api/           # API route handlers
│   ├── core/          # Core business logic
│   ├── db/            # Database configuration
│   └── util/          # Utilities and configuration
├── prisma/            # Database schema and migrations
├── scripts/           # Demo and utility scripts
├── samples/           # Sample files for testing
└── docker-compose.yml # Container orchestration
```

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run demo script
./scripts/demo-upload.sh
```

### Database Management

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes
npm run db:push

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
```

## Deployment

### Production Considerations

1. **Environment Variables**: Use secure secret management
2. **Database**: Use managed PostgreSQL service
3. **Storage**: Use production S3-compatible service
4. **Monitoring**: Configure Prometheus and Grafana
5. **Logging**: Use structured logging aggregation
6. **Security**: Enable HTTPS and proper CORS
7. **Scaling**: Use load balancer for multiple instances

### Docker Production

```bash
# Build production image
docker build -t evidence-locker:latest .

# Run with production config
docker run -d \
  --name evidence-locker \
  -p 4600:4600 \
  -e DATABASE_URL="postgresql://..." \
  -e S3_ENDPOINT="https://s3.amazonaws.com" \
  evidence-locker:latest
```

## Troubleshooting

### Common Issues

1. **Database Connection**: Check `DATABASE_URL` and network connectivity
2. **Storage Access**: Verify S3 credentials and bucket permissions
3. **HMAC Authentication**: Ensure app keys match between client and server
4. **File Size Limits**: Check `MAX_UPLOAD_BYTES` configuration
5. **MIME Type Errors**: Verify file type is in allowlist

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Check health endpoints
curl http://localhost:4600/health
curl http://localhost:4600/metrics
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation
