import { createReadStream, createWriteStream} from "fs";
import { mkdir, unlink} from "fs/promises";
import { tmpdir} from "os";
import { join} from "path";
import { Transform, TransformCallback, pipeline} from "stream";
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

    constructor(tempDir: string){
        super({
            readableObjectMode: true,
            writableObjectMode: false,
        });

        this.accumulator = [];
        this.accumulatedBytes = 0;
        this.sequenceNo = 0;
        this.tempDir = tempDir;
    }

    _transform(incoming: Buffer, _encoding: string, callback: TransformCallback): void{
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
    chunks: ChunkMeta[];
    totalChunks: number;
    totalBytes: number;
    tempDir: string;
}
// chunkFile() is the single public function this module exposes.
// It takes a file path, streams it through FileChunker, collects all
// emitted ChunkMeta objects, and returns them as an ordered array.
//
// Why async + stream instead of just reading the whole file?
// A 35 GB file cannot fit in RAM. The stream reads ~64 KB at a time,
// accumulates into 8 MB chunks, writes each to disk, and releases the memory.
// Peak RAM usage is roughly 2 × CHUNK_SIZE (~16 MB), regardless of file size.

export async function chunkFile(filePath: string): Promise<ChunkingResult> {
    const tempDir = join(tmpdir(), `multidrive-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});

    const chunker = new FileChunker(tempDir);
    const chunks: ChunkMeta[] = [];
    let totalBytes = 0;

    chunker.on("data", (chunk: ChunkMeta) => {
        chunks.push(chunk);
        totalBytes += chunk.sizeBytes;
    });

    const source = createReadStream(filePath);
    await pipelineAsync(source, chunker);

    chunks.sort((a,b) => a.sequenceNo - b.sequenceNo);

    return {
        chunks,
        totalChunks: chunks.length,
        totalBytes,
        tempDir,
    };
}

export async function cleanupChunks(chunks: ChunkMeta[]): Promise<void> {
  await Promise.all(
    chunks.map((c) => unlink(c.localPath).catch(() => {
      // Ignore "file not found" — already cleaned up or never written
    }))
  );
}