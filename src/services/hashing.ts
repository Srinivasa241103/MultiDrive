import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { IntegrityError } from '../utils/errors';

export function hashBuffer(buffer : Buffer) : string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function hashStream(readable: Readable) : Promise<string>{
    const hash = crypto.createHash("sha256");
    await pipeline(readable, hash);
    return hash.digest("hex");
}

export function verifyBuffer(buffer: Buffer, expectedHash: string):void{
    const computedHash = hashBuffer(buffer);
    if(computedHash !== expectedHash){
        throw new IntegrityError("Hash mismatch: data integrity compromised",
            expectedHash,
            computedHash
        );
    }

    const computedBuf = Buffer.from(computedHash, "hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");

    const isMatch = crypto.timingSafeEqual(computedBuf, expectedBuf);
    if(!isMatch){
        throw new IntegrityError(
            "Chunk integrity check failed - SHA-256 mismatch",
            expectedHash,
            computedHash
        );
    }
}

export function mdf5Buffer(buffer: Buffer):string{
    return crypto.createHash("md5").update(buffer).digest("hex");
}