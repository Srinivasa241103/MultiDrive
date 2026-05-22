import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../api/server';
import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('../../src/services/driveService', () => ({
  uploadChunkToDrive: vi.fn().mockResolvedValue({
    driveFileId: 'mock-drive-id',
    md5Checksum: 'mockedmd5',
  }),
  downloadChunkFromDrive: vi.fn().mockImplementation(async () => {
    return Buffer.alloc(1024, 0x42);
  }),
  deleteChunkFromDrive: vi.fn().mockResolvedValue(undefined),
  getStorageQuota: vi.fn().mockResolvedValue({ total: 1e12, used: 0 }),
}));

let app: FastifyInstance;
let testFilePath: string;
let authToken: string;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();

  authToken = app.jwt.sign({ id: 'test-user-id', email: 'test@example.com' });

  testFilePath = join('/tmp', 'test-upload.bin');
  await writeFile(testFilePath, randomBytes(1024 * 1024));
});

afterAll(async () => {
  await app.close();
  await unlink(testFilePath).catch(() => {});
});

describe('health', () => {
  it('GET /health returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('file upload and download', () => {
  it('POST /files/upload returns 202 with fileId', async () => {
    const form = new FormData();
    form.append('file', new Blob([randomBytes(1024 * 1024)]), 'test.bin');

    const res = await app.inject({
      method: 'POST',
      url: '/files/upload',
      headers: {
        'content-type': 'multipart/form-data',
        authorization: `Bearer ${authToken}`,
      },
      payload: form,
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.fileId).toBeDefined();
  });
});