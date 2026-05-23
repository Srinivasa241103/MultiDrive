import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const SALT_LENGTH = 16;
const KEY_LENGTH  = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt    = randomBytes(SALT_LENGTH).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived    = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  const keyBuffer  = Buffer.from(key, 'hex');
  if (derived.length !== keyBuffer.length) return false;
  return timingSafeEqual(derived, keyBuffer);
}
