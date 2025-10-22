import { register, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry to avoid conflicts
const registry = new register();

// Upload metrics
export const uploadInitiatedCounter = new Counter({
  name: 'evidence_locker_uploads_initiated_total',
  help: 'Total number of upload sessions initiated',
  labelNames: ['org_id'],
  registers: [registry],
});

export const uploadCompletedCounter = new Counter({
  name: 'evidence_locker_uploads_completed_total',
  help: 'Total number of uploads completed successfully',
  labelNames: ['org_id', 'mime_type'],
  registers: [registry],
});

export const uploadFailedCounter = new Counter({
  name: 'evidence_locker_uploads_failed_total',
  help: 'Total number of uploads that failed',
  labelNames: ['org_id', 'error_type'],
  registers: [registry],
});

// Storage metrics
export const bytesStoredGauge = new Gauge({
  name: 'evidence_locker_bytes_stored_total',
  help: 'Total bytes stored in the evidence locker',
  registers: [registry],
});

export const artifactsStoredGauge = new Gauge({
  name: 'evidence_locker_artifacts_stored_total',
  help: 'Total number of artifacts stored',
  registers: [registry],
});

export const deduplicationCounter = new Counter({
  name: 'evidence_locker_deduplication_hits_total',
  help: 'Total number of deduplication hits (same content uploaded multiple times)',
  registers: [registry],
});

// Download metrics
export const downloadsCounter = new Counter({
  name: 'evidence_locker_downloads_total',
  help: 'Total number of downloads',
  labelNames: ['org_id'],
  registers: [registry],
});

// Verification metrics
export const verificationsCounter = new Counter({
  name: 'evidence_locker_verifications_total',
  help: 'Total number of verification requests',
  labelNames: ['exists'],
  registers: [registry],
});

// IPFS metrics (optional)
export const ipfsPinSuccessCounter = new Counter({
  name: 'evidence_locker_ipfs_pin_success_total',
  help: 'Total number of successful IPFS pins',
  registers: [registry],
});

export const ipfsPinFailedCounter = new Counter({
  name: 'evidence_locker_ipfs_pin_failed_total',
  help: 'Total number of failed IPFS pins',
  labelNames: ['error_type'],
  registers: [registry],
});

// Performance metrics
export const uploadDurationHistogram = new Histogram({
  name: 'evidence_locker_upload_duration_seconds',
  help: 'Duration of upload operations in seconds',
  labelNames: ['org_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const downloadDurationHistogram = new Histogram({
  name: 'evidence_locker_download_duration_seconds',
  help: 'Duration of download operations in seconds',
  labelNames: ['org_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// Hash computation metrics
export const hashComputationDurationHistogram = new Histogram({
  name: 'evidence_locker_hash_computation_duration_seconds',
  help: 'Duration of hash computation operations in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [registry],
});

export { registry };
