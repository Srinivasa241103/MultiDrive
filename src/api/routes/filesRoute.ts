import '@fastify/multipart';
import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authMiddleware';
import { chunkFile, cleanupChunks } from '../../services/chunker';
import { pickAccount } from '../../services/placementService';
import { enqueueChunkUpload } from '../../services/queue/jobs';
import {
  createFileRecord,
  markFileFailed,
  downloadFileChunks,
  getChunkManifest,
} from '../../services/fileService';
import { db } from '../../db/client';
import { hashStream } from '../../services/hashing';
import { FileStatus } from '@prisma/client';
import { logger } from '../../utils/logger';
import { createReadStream } from 'fs';

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.post('/files/upload', { onRequest: [authenticate] }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    const fileName = data.filename;
    const mimeType = data.mimetype;

    const result = await chunkFile(data.file);

    const sha256Full = result.sha256Full;
    const existing = await db.file.findFirst({
      where: { sha256Full, status: FileStatus.COMMITTED },
    });

    if (existing) {
      await cleanupChunks(result.chunks);
      return reply.send({ fileId: existing.id, deduped: true });
    }

    const fileId = await createFileRecord({
      userId: request.user.id,
      name: fileName,
      sizeBytes: result.totalBytes,
      mimeType,
      totalChunks: result.chunks.length,
      sha256Full,
    });

    try {
      for (const chunk of result.chunks) {
        const account = await pickAccount(chunk.sizeBytes);
        await enqueueChunkUpload({
            fileId,
            sequenceNo: chunk.sequenceNo,
            accountId: account.id,
            sha256: chunk.sha256,
            localPath: chunk.localPath!,
            sizeBytes: chunk.sizeBytes,
            encrypt: false
        });
      }
    } catch (err) {
      await markFileFailed(fileId);
      await cleanupChunks(result.chunks);
      throw err;
    }

    logger.info({ fileId, chunks: result.chunks.length }, 'file upload initiated');
    reply.status(202).send({ fileId, totalChunks: result.chunks.length });
  });

  app.get<{ Params: { id: string } }>(
    '/files/:id/status',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const file = await db.file.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { chunks: true } } },
      });

      if (!file) return reply.status(404).send({ error: 'File not found' });

      reply.send({
        fileId: file.id,
        status: file.status,
        totalChunks: file.totalChunks,
        completedChunks: file._count.chunks,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/files/:id/download',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const file = await db.file.findUnique({
        where: { id: request.params.id },
      });

      if (!file) return reply.status(404).send({ error: 'File not found' });
      if (file.status !== FileStatus.COMMITTED) {
        return reply.status(409).send({ error: 'File is not fully uploaded yet' });
      }

      const safeName = encodeURIComponent(file.name || file.id).replace(/'/g, "'");
      reply.header('Content-Disposition', `attachment; filename="${file.name || file.id}"; filename*=UTF-8''${safeName}`);
      reply.header('Content-Type', file.mimeType ?? 'application/octet-stream');

      const chunks = downloadFileChunks(file.id);
      for await (const chunk of chunks) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    },
  );

  app.get(
    '/files',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const files = await db.file.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
      });
      reply.send(files.map((f) => ({ ...f, sizeBytes: Number(f.sizeBytes) })));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/files/:id/chunks',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const chunks = await db.chunk.findMany({
        where: { fileId: request.params.id },
        include: { account: { select: { email: true } } },
        orderBy: { sequenceNo: 'asc' },
      });

      return reply.send(
        chunks.map((c) => ({
          sequenceNo: c.sequenceNo,
          email:      c.account.email,
          driveFileId: c.driveFileId ?? '—',
          sizeBytes:  c.sizeBytes,
          status:     c.status,
        })),
      );
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/files/:id',
    { onRequest: [authenticate] },
    async (request, reply) => {
      const file = await db.file.findUnique({
        where: { id: request.params.id },
      });
      if (!file) return reply.status(404).send({ error: 'File not found' });

      await db.file.delete({ where: { id: request.params.id } });
      reply.send({ message: 'File deleted' });
    },
  );
}