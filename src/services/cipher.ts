import crypto from 'crypto';
import { IntegrityError } from '../utils/errors';
import { config } from "../config/env";


export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer>{
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(
            passphrase,
            salt,
            100_000,
            32,
            "sha256",
            (err, deriveKey) => {
                if(err) reject(err);
                else resolve(deriveKey);
            }
        )
    });

}

// encrypting funciton part

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: Buffer, key: Buffer): Buffer{
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
}

// decrypting the hash 
export function decrypt(encryptedBlob: Buffer, key: Buffer): Buffer{
    const MIN_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH;
    if(encryptedBlob.length < MIN_LENGTH){
        throw new IntegrityError(
            `Encrypted blob too short — expected at least ${MIN_LENGTH} bytes, got ${encryptedBlob.length}`,
            `min length: ${MIN_LENGTH}`,
            `actual length: ${encryptedBlob.length}`
        );
    }

    const iv         = encryptedBlob.subarray(0, IV_LENGTH);
    const authTag    = encryptedBlob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encryptedBlob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    try{
        const plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return plaintext;
    }catch(err){
        throw new IntegrityError(
            "AES-256-GCM authentication failed — ciphertext was tampered with or key is wrong",
            "authTag must match",
            err instanceof Error ? err.message : "unknown crypto error"
        );
    }

}


let cachedKey: Buffer | null = null;

export async function getKey(): Promise<Buffer> {
  if (cachedKey !== null) {
    return cachedKey;
  }
  const salt = Buffer.from(config.ENCRYPTION_SALT, "hex");
  cachedKey = await deriveKey(config.ENCRYPTION_PASSPHRASE, salt);

  return cachedKey;
} 