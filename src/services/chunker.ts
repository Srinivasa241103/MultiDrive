import { createHash, Hash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, unlink} from "fs/promises";
import { tmpdir} from "os";
import { join} from "path";
import { Readable, Transform, TransformCallback, pipeline} from "stream";
import {promisify } from "util";
import {CONSTANTS} from "../config/constants";
import { hashBuffer } from "./hashing";
import {ChunkMeta} from "../types/domain";

const pipelineAsync = promisify(pipeline);

class FileChunker extends Transform{
    private accumulator: Buffer[];
    private accumulatedBytes: number;
    private sequenceNo: number;
    private tempDir: string;
    private fullFileHash: Hash;

    constructor(tempDir: string){
        super({
            readableObjectMode: true,
            writableObjectMode: false,
        });

        this.accumulator = [];
        this.accumulatedBytes = 0;
        this.sequenceNo = 0;
        this.tempDir = tempDir;
        this.fullFileHash = createHash('sha256');
    }

    _transform(incoming: Buffer, _encoding: string, callback: TransformCallback): void{
        this.fullFileHash.update(incoming);
        this.accumulator.push(incoming);
        this.accumulatedBytes += incoming.length;

        const processChunks = async () => {
            while(this.accumulatedBytes >= CONSTANTS.CHUNK_SIZE){
                const merged = Buffer.concat(this.accumulator);
                const chunkData = merged.subarray(0, CONSTANTS.CHUNK_SIZE);
                const remainder = merged.subarray(CONSTANTS.CHUNK_SIZE);

                this.accumulator = remainder.length > 0 ? [remainder] : [];
                this.accumulatedBytes = remainder.length;

                await this._emitChunk(chunkData);
            }
        };

        processChunks().then(() => callback()).catch((err) => callback(err));
    }

    _flush(callback: TransformCallback): void{
        if(this.accumulatedBytes > 0){
            const finalData = Buffer.concat(this.accumulator);
            this._emitChunk(finalData)
                .then(()=>callback())
                .catch((err) => callback(err));
        } else{
            callback();
        }
    }

    getFullHash(): string {
        return this.fullFileHash.digest('hex');
    }

    private async _emitChunk(data:Buffer): Promise<void>{
        const seq = this.sequenceNo++;
        const sha256 = hashBuffer(data);

        const filename = `chunk-${seq}-${sha256.slice(0,8)}.bin`;
        const localPath = join(this.tempDir, filename);

        await new Promise<void>((resolve, reject) =>{
            const ws = createWriteStream(localPath);
            ws.on("finish", resolve);
            ws.on("error", reject);
            ws.end(data);
        });

        const meta: ChunkMeta = {
            sequenceNo: seq,
            sha256,
            sizeBytes: data.length,
            data,
            localPath,
        };

        this.push(meta);
    }
}

export interface ChunkingResult {
    sha256Full: any;
    chunks: ChunkMeta[];
    totalChunks: number;
    totalBytes: number;
    tempDir: string;
}

export async function chunkFile(source: Readable): Promise<ChunkingResult> {
    const tempDir = join(tmpdir(), `multidrive-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});

    const chunker = new FileChunker(tempDir);
    const chunks: ChunkMeta[] = [];
    let totalBytes = 0;

    chunker.on("data", (chunk: ChunkMeta) => {
        chunks.push(chunk);
        totalBytes += chunk.sizeBytes;
    });

    await pipelineAsync(source, chunker);

    chunks.sort((a,b) => a.sequenceNo - b.sequenceNo);

    return {
        chunks,
        totalChunks: chunks.length,
        totalBytes,
        tempDir,
        sha256Full: chunker.getFullHash(),
    };
}

export async function cleanupChunks(chunks: ChunkMeta[]): Promise<void> {
  await Promise.all(
    chunks.map((c) => unlink(c.localPath).catch(() => {
      // Ignore "file not found" — already cleaned up or never written
    }))
  );
}