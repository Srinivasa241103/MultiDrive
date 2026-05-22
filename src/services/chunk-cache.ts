import { redisConnection } from "./queue/connection";
import {CONSTANTS} from "../config/constants";

const CACHE_PREFIX = 'chunk:';

export async function getCachedChunk(sha256: string) : Promise<Buffer | null> {
    const key = `${CACHE_PREFIX}${sha256}`;
    const data = await redisConnection.getBuffer(key);
    return data ?? null;
}

export async function cacheChunk(sha256: string, data: Buffer): Promise<void>{
    const key = `${CACHE_PREFIX}${sha256}`;
    await redisConnection.set(key, data, 'EX', CONSTANTS.CACHE_TTL_SECONDS);
}

export async function invalidateCachedChunk(sha256: string) : Promise<void>{
    const key = `${CACHE_PREFIX}${sha256}`;
    await redisConnection.del(key);
}