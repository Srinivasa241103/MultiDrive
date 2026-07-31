import { getValidAccessToken } from "./tokenStore";
import { performResumableUpload } from "./resumableUpload";
import { mdf5Buffer } from "./hashing";
import { IntegrityError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ChunkUploadError } from "../utils/errors";

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

export async function uploadChunkToDrive(
    accountId: string,
    data: Buffer,
    fileName: string,
): Promise<{ driveFileId: string; md5Checksum: string }> {
    const accessToken = await getValidAccessToken(accountId);
    const result = await performResumableUpload(accessToken, data, fileName);

    const localMd5 = mdf5Buffer(data);
    if (localMd5 !== result.md5Checksum) {
        throw new IntegrityError(
            `MD5 mismatch after upload for ${fileName}`,
            result.md5Checksum,
            localMd5,
        );
    }

    logger.info({ accountId, driveFileId: result.driveFileId, fileName }, 'chunk uploaded to Drive');
    return result;
}

export async function downloadChunkFromDrive(
    accountId: string,
    driveFileId: string,
): Promise<Buffer> {
    const accessToken = await getValidAccessToken(accountId);

    const response = await fetch(`${DRIVE_BASE}/files/${driveFileId}?alt=media`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

    if (!response.ok) {
        throw new ChunkUploadError(`Failed to download chunk ${driveFileId} from account ${accountId}: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export async function deleteChunkFromDrive(
    accountId: string,
    driveFileId: string,
): Promise<void> {
    const accessToken = await getValidAccessToken(accountId);

    const response = await fetch(`${DRIVE_BASE}/files/${driveFileId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok && response.status != 404) {
        throw new Error(
            `Failed to delete chunk ${driveFileId} from account ${accountId}: ${response.status}`,
        );
    }
    logger.info({ accountId, driveFileId }, 'chunk deleted from Drive');
}

export async function getStorageQuota(
    accountId: string,
): Promise<{ total: number; used: number }> {
    const accessToken = await getValidAccessToken(accountId);

    const response = await fetch(`${DRIVE_BASE}/about?fields=storageQuota`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to fetch storage quota for account ${accountId}: ${response.status} — ${body}`);
    }

    const data = (await response.json()) as {
        storageQuota: { limit: string; usage: string };
    };

    return {
        total: parseInt(data.storageQuota.limit, 10),
        used: parseInt(data.storageQuota.usage, 10),
    };
}