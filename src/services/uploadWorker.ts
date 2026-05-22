import { Worker } from 'bullmq';
import { readFile } from 'fs/promises';
import { redisConnection } from './queue/connection';
import { uploadChunkToDrive } from './driveService';
import { markChunkComplete } from './fileService';
import { recordBytesUploaded } from './placementService';
import { CONSTANTS } from '../config/constants';
import { logger } from '../utils/logger';
import type { UploadJobData, UploadJobResult } from '../types/domain';

export const uploadWorker = new Worker<UploadJobData, UploadJobResult>(
  'chunk-upload',
  async (job) => {
    const { fileId, sequenceNo, accountId, sha256, localPath, sizeBytes } = job.data;

    logger.info({ fileId, sequenceNo, accountId }, 'processing chunk upload job');

    const data = await readFile(localPath);

    const { driveFileId, md5Checksum } = await uploadChunkToDrive(
      accountId,
      data,
      `chunk-${fileId}-${sequenceNo}`,
    );

    await markChunkComplete({
      fileId,
      sequenceNo,
      sha256,
      sizeBytes,
      accountId,
      driveFileId,
    });

    await recordBytesUploaded(accountId, sizeBytes);

    logger.info({ fileId, sequenceNo, driveFileId, md5Checksum }, 'chunk complete');

    return { driveFileId, md5Checksum, bytesUploaded: sizeBytes };
  },
  {
    connection: redisConnection,
    concurrency: CONSTANTS.WORKER_CONCURRENCY,
  },
);

uploadWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, fileId: job?.data.fileId, sequenceNo: job?.data.sequenceNo, err },
    'chunk upload job failed',
  );
});