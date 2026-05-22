import { db } from '../db/client';
import { FileStatus, ChunkStatus } from '@prisma/client';
import type { ChunkManifestEntry } from '../types/domain';

export async function createFileRecord(params: {
  userId: string;
  sizeBytes: number;
  mimeType: string;
  totalChunks: number;
  sha256Full: string;
}): Promise<string> {
  const file = await db.file.create({
    data: {
      userId: params.userId,
      sizeBytes: BigInt(params.sizeBytes),
      mimeType: params.mimeType,
      totalChunks: params.totalChunks,
      sha256Full: params.sha256Full,
      status: FileStatus.UPLOADING,
    },
  });
  return file.id;
}

export async function markChunkComplete(params: {
  fileId: string;
  sequenceNo: number;
  sha256: string;
  sizeBytes: number;
  accountId: string;
  driveFileId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.chunk.upsert({
      where: {
        fileId_sequenceNo: {
          fileId: params.fileId,
          sequenceNo: params.sequenceNo,
        },
      },
      create: {
        fileId: params.fileId,
        sequenceNo: params.sequenceNo,
        sha256: params.sha256,
        sizeBytes: params.sizeBytes,
        accountId: params.accountId,
        driveFileId: params.driveFileId,
        status: ChunkStatus.COMPLETE,
      },
      update: {
        driveFileId: params.driveFileId,
        accountId: params.accountId,
        status: ChunkStatus.COMPLETE,
      },
    });

    const file = await tx.file.findUniqueOrThrow({
      where: { id: params.fileId },
    });

    const completeCount = await tx.chunk.count({
      where: { fileId: params.fileId, status: ChunkStatus.COMPLETE },
    });

    if (completeCount === file.totalChunks) {
      await tx.file.update({
        where: { id: params.fileId },
        data: { status: FileStatus.COMMITTED },
      });
    }
  });
}

export async function getChunkManifest(
  fileId: string,
): Promise<ChunkManifestEntry[]> {
  const chunks = await db.chunk.findMany({
    where: { fileId, status: ChunkStatus.COMPLETE },
    orderBy: { sequenceNo: 'asc' },
  });

  return chunks.map((c) => ({
    sequenceNo: c.sequenceNo,
    sha256: c.sha256,
    sizeBytes: c.sizeBytes,
    driveFileId: c.driveFileId!,
    accountId: c.accountId,
  }));
}

export async function markFileFailed(fileId: string): Promise<void> {
  await db.file.update({
    where: { id: fileId },
    data: { status: FileStatus.FAILED },
  });
}