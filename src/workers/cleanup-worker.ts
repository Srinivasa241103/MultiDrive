import { Worker } from "bullmq";
import { redisConnection } from "../services/queue/connection";
import { db } from "../db/client";
import { deleteChunkFromDrive } from "../services/driveService";
import { FileStatus, ChunkStatus } from "@prisma/client";
import { logger } from "../utils/logger";

const ORPHAN_AGE_MS = 24*60*60*1000;

export const cleanupWorker = new Worker(
    'cleanup',
    async (job) => {
     const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);

    const orphanFiles = await db.file.findMany({
      where: {
        status: FileStatus.UPLOADING,
        createdAt: { lt: cutoff },
      },
      include: { chunks: true },
    });

    for (const file of orphanFiles) {
      logger.info({ fileId: file.id }, 'cleaning up orphan file');

      for (const chunk of file.chunks) {
        if (chunk.driveFileId && chunk.accountId) {
          try {
            await deleteChunkFromDrive(chunk.accountId, chunk.driveFileId);
          } catch (err) {
            logger.warn({ chunkId: chunk.id, err }, 'failed to delete orphan chunk from Drive');
          }
        }
      }

      await db.chunk.deleteMany({ where: { fileId: file.id } });
      await db.file.update({
        where: { id: file.id },
        data: { status: FileStatus.FAILED },
      });

      logger.info({ fileId: file.id }, 'orphan file cleaned up');
    }
  },
  {
    connection: redisConnection,
  },
);

cleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'cleanup job failed');
});