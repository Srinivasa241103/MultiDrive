import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { chunkFile, cleanupChunks } from "../services/chunker";
import { CONSTANTS } from "../config/constants";
import { ChunkMeta } from "../types/domain";

const CHUNK_SIZE = CONSTANTS.CHUNK_SIZE;

// ─── Test fixtures ────────────────────────────────────────────────────────────

// We create synthetic test files in a temp directory instead of shipping
// binary blobs in the repo. Each test gets a deterministic buffer so
// results are reproducible across machines.

const TEST_DIR = join(tmpdir(), "multidrive-chunker-tests");

// Helper — creates a Buffer of exactly `sizeBytes` filled with a repeating
// pattern derived from the seed. Using a pattern (not random) means the
// same seed always produces the same bytes — tests are deterministic.
function makeBuffer(sizeBytes: number, seed: number = 0): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    // XOR of index bytes with seed produces a non-trivial repeating pattern
    buf[i] = (i ^ seed ^ (i >> 8) ^ (i >> 16)) & 0xff;
  }
  return buf;
}

// Helper — SHA-256 of a Buffer, returns hex string.
// Used in tests to verify reassembly without importing hashing.ts
// (so tests stay independent of the service under test).
function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// Helper — writes a Buffer to a temp file, returns the file path.
async function writeTempFile(name: string, data: Buffer): Promise<string> {
  const filePath = join(TEST_DIR, name);
  await writeFile(filePath, data);
  return filePath;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  // Clean up all temp files created during the test run
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("chunkFile", () => {

  // ── Test 1: correct chunk count for a known file size ─────────────────────
  //
  // The most basic invariant: Math.ceil(fileSize / CHUNK_SIZE) chunks.
  // We test three sizes:
  //   - Exactly 1 chunk  (boundary: file fits in one chunk)
  //   - Exactly multiple (boundary: no remainder — _flush emits nothing)
  //   - Non-multiple     (general case: has a remainder chunk)

  it("produces exactly 1 chunk for a file smaller than CHUNK_SIZE", async () => {
    const data = makeBuffer(1024 * 1024); // 1 MB — well under 8 MB
    const filePath = await writeTempFile("1mb.bin", data);

    const result = await chunkFile(filePath);

    expect(result.totalChunks).toBe(1);
    expect(result.chunks).toHaveLength(1);

    await cleanupChunks(result.chunks);
  });

  it("produces correct chunk count for a 100 MB file (12 full + 1 remainder)", async () => {
    // 100 MB = 104,857,600 bytes
    // 104,857,600 / 8,388,608 = 12.5 → Math.ceil = 13 chunks
    const ONE_HUNDRED_MB = 100 * 1024 * 1024;
    const data = makeBuffer(ONE_HUNDRED_MB, 42);
    const filePath = await writeTempFile("100mb.bin", data);

    const result = await chunkFile(filePath);

    const expectedChunks = Math.ceil(ONE_HUNDRED_MB / CHUNK_SIZE); // 13
    expect(result.totalChunks).toBe(expectedChunks);
    expect(result.chunks).toHaveLength(expectedChunks);

    await cleanupChunks(result.chunks);
  });

  it("produces correct chunk count for a file that is exactly 2 × CHUNK_SIZE (no remainder)", async () => {
    // Exactly 16 MB — _flush should emit nothing (accumulatedBytes === 0)
    const data = makeBuffer(CHUNK_SIZE * 2, 7);
    const filePath = await writeTempFile("exact-2chunks.bin", data);

    const result = await chunkFile(filePath);

    expect(result.totalChunks).toBe(2);
    expect(result.chunks).toHaveLength(2);

    await cleanupChunks(result.chunks);
  });

  // ── Test 2: sequence numbers are contiguous and 0-indexed ─────────────────
  //
  // Reassembly depends entirely on sequence numbers being correct.
  // A gap or duplicate would silently corrupt the reassembled file.

  it("emits chunks with contiguous 0-indexed sequence numbers", async () => {
    const data = makeBuffer(CHUNK_SIZE * 3 + 1024); // 3 full + small tail
    const filePath = await writeTempFile("seq-test.bin", data);

    const result = await chunkFile(filePath);

    result.chunks.forEach((chunk: ChunkMeta, index: number) => {
      expect(chunk.sequenceNo).toBe(index);
    });

    await cleanupChunks(result.chunks);
  });

  // ── Test 3: chunk sizes are correct ──────────────────────────────────────
  //
  // Every chunk except the last must be exactly CHUNK_SIZE bytes.
  // The last chunk must be exactly (totalBytes % CHUNK_SIZE) bytes.
  // If the file is an exact multiple, the last chunk is also CHUNK_SIZE.

  it("every chunk except the last is exactly CHUNK_SIZE bytes", async () => {
    const EXTRA = 500_000; // 500 KB tail
    const data = makeBuffer(CHUNK_SIZE * 2 + EXTRA, 3);
    const filePath = await writeTempFile("sizes-test.bin", data);

    const result = await chunkFile(filePath);

    // chunks 0 and 1 must be full-size
    expect(result.chunks[0].sizeBytes).toBe(CHUNK_SIZE);
    expect(result.chunks[1].sizeBytes).toBe(CHUNK_SIZE);

    // chunk 2 must be exactly the tail size
    expect(result.chunks[2].sizeBytes).toBe(EXTRA);

    await cleanupChunks(result.chunks);
  });

  it("reports correct totalBytes matching the original file size", async () => {
    const FILE_SIZE = CHUNK_SIZE * 2 + 123_456;
    const data = makeBuffer(FILE_SIZE, 9);
    const filePath = await writeTempFile("totalbytes-test.bin", data);

    const result = await chunkFile(filePath);

    expect(result.totalBytes).toBe(FILE_SIZE);

    await cleanupChunks(result.chunks);
  });

  // ── Test 4: byte-perfect reassembly ───────────────────────────────────────
  //
  // This is the most important test. Concatenate all chunk.data buffers
  // in sequenceNo order and verify the SHA-256 matches the original file.
  // If this passes, the chunker neither loses nor corrupts a single byte.

  it("reassembles into byte-perfect original for a 100 MB file", async () => {
    const ONE_HUNDRED_MB = 100 * 1024 * 1024;
    const original = makeBuffer(ONE_HUNDRED_MB, 99);
    const originalHash = sha256Hex(original);
    const filePath = await writeTempFile("reassembly-100mb.bin", original);

    const result = await chunkFile(filePath);

    // Concatenate chunk data in order
    const reassembled = Buffer.concat(
      result.chunks
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
        .map((c) => c.data)
    );

    const reassembledHash = sha256Hex(reassembled);

    expect(reassembledHash).toBe(originalHash);
    expect(reassembled.length).toBe(ONE_HUNDRED_MB);

    await cleanupChunks(result.chunks);
  });

  it("reassembles byte-perfectly for a file that is exactly 1 × CHUNK_SIZE", async () => {
    const original = makeBuffer(CHUNK_SIZE, 55);
    const originalHash = sha256Hex(original);
    const filePath = await writeTempFile("reassembly-exact.bin", original);

    const result = await chunkFile(filePath);

    const reassembled = Buffer.concat(result.chunks.map((c) => c.data));
    expect(sha256Hex(reassembled)).toBe(originalHash);

    await cleanupChunks(result.chunks);
  });

  // ── Test 5: per-chunk SHA-256 hashes are correct ──────────────────────────
  //
  // The chunker computes and attaches a SHA-256 to each ChunkMeta.
  // Verify that the hash on each chunk matches a fresh hash of its own data.
  // This proves hashing.ts and the chunker are wired correctly.

  it("attaches a correct SHA-256 to every chunk", async () => {
    const data = makeBuffer(CHUNK_SIZE * 2 + 4096, 11);
    const filePath = await writeTempFile("hashes-test.bin", data);

    const result = await chunkFile(filePath);

    for (const chunk of result.chunks) {
      const expected = sha256Hex(chunk.data);
      expect(chunk.sha256).toBe(expected);
    }

    await cleanupChunks(result.chunks);
  });

  // ── Test 6: a single bit flip is detectable ───────────────────────────────
  //
  // This is your integrity proof. Flip one bit in one chunk's data
  // and verify the SHA-256 no longer matches. This confirms that the
  // hash stored in ChunkMeta would catch corruption in production.

  it("detects a single bit flip via SHA-256 mismatch", async () => {
    const data = makeBuffer(CHUNK_SIZE + 1024, 77);
    const filePath = await writeTempFile("bitflip-test.bin", data);

    const result = await chunkFile(filePath);
    const chunk = result.chunks[0];

    // Record the original hash as stored by the chunker
    const originalHash = chunk.sha256;

    // Flip one bit in the data buffer (XOR byte 100 with 0x01)
    const corrupted = Buffer.from(chunk.data);
    corrupted[100] = corrupted[100] ^ 0x01;

    // The fresh hash of the corrupted data must differ
    const corruptedHash = sha256Hex(corrupted);
    expect(corruptedHash).not.toBe(originalHash);

    await cleanupChunks(result.chunks);
  });

  // ── Test 7: temp files are written and cleanupChunks removes them ─────────
  //
  // Verifies the temp-file lifecycle: files exist after chunkFile(),
  // and are gone after cleanupChunks().

  it("writes chunk temp files to disk and cleanupChunks deletes them", async () => {
    const { access } = await import("fs/promises");
    const data = makeBuffer(CHUNK_SIZE + 512, 22);
    const filePath = await writeTempFile("tempfile-test.bin", data);

    const result = await chunkFile(filePath);

    // Verify temp files exist
    for (const chunk of result.chunks) {
      await expect(access(chunk.localPath)).resolves.toBeUndefined();
    }

    // Clean up
    await cleanupChunks(result.chunks);

    // Verify temp files are gone
    for (const chunk of result.chunks) {
      await expect(access(chunk.localPath)).rejects.toThrow();
    }
  });

  // ── Test 8: empty file produces zero chunks ────────────────────────────────
  //
  // Edge case: an empty file should produce no chunks and totalBytes = 0.
  // Without this guard, a downstream component might hang waiting for
  // chunks that never arrive.

  it("produces zero chunks and totalBytes = 0 for an empty file", async () => {
    const filePath = await writeTempFile("empty.bin", Buffer.alloc(0));

    const result = await chunkFile(filePath);

    expect(result.totalChunks).toBe(0);
    expect(result.chunks).toHaveLength(0);
    expect(result.totalBytes).toBe(0);

    await cleanupChunks(result.chunks);
  });

});