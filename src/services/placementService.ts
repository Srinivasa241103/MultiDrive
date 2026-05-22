import { db } from "../db/client";
import {CONSTANTS} from '../config/constants';
import type { AccountRecord } from "../types/domain";

let roundRobinIndex = 0;

export async function pickAccount(chunkSizeBytes: number) : Promise<AccountRecord>{
    const accounts = await db.account.findMany({
        where: {health: true},
    });

    const eligible = accounts.filter((account) => {
        const wouldExceedDaily = Number(account.uploadedTodayBytes ?? 0) + chunkSizeBytes > CONSTANTS.DRIVE_DAILY_UPLOAD_LIMIT_BYTES;
        const tooFull = (account.quotaTotalBytes ?? 0) - (account.quotaUsedBytes ?? 0) < CONSTANTS.DRIVE_FREE_SPACE_MINIMUM_BYTES;
        return !wouldExceedDaily && !tooFull;
    });

    if(eligible.length === 0){
        throw new Error('No eligible accounts available for placement');
    }

    const account = eligible[roundRobinIndex %eligible.length];
    roundRobinIndex = (roundRobinIndex + 1)%eligible.length;
    return account as unknown as AccountRecord;
}

export async function recordBytesUploaded(
    accountId: string, 
    bytes: number,
) : Promise<void>{
    await db.account.update({
        where: {id : accountId},
        data: {
            uploadedTodayBytes: {increment: bytes},
            quotaUsedBytes: {increment: bytes},
        },
    });
}