import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

export const chunksUploadedTotal = new Counter({
  name: 'chunks_uploaded_total',
  help: 'Total number of chunks successfully uploaded',
  registers: [register],
});

export const uploadBytesTotal = new Counter({
  name: 'upload_bytes_total',
  help: 'Total bytes uploaded',
  registers: [register],
});

export const downloadBytesTotal = new Counter({
  name: 'download_bytes_total',
  help: 'Total bytes downloaded',
  registers: [register],
});

export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total chunk cache hits',
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total chunk cache misses',
  registers: [register],
});

export const drive429Total = new Counter({
  name: 'drive_429_total',
  help: 'Total 429 rate limit responses from Google Drive',
  registers: [register],
});

export const uploadDurationSeconds = new Histogram({
  name: 'upload_duration_seconds',
  help: 'Duration of chunk uploads in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const activeWorkers = new Gauge({
  name: 'active_workers',
  help: 'Number of currently active upload workers',
  registers: [register],
});