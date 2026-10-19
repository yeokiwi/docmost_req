import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as OTPAuth from 'otpauth';

export const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, label: string, issuer: string) {
  return new OTPAuth.TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** Accepts the current code and one step either side for clock drift. */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  const totp = buildTotp(secretBase32, 'x', 'x');
  return totp.validate({ token, window: 1 }) !== null;
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let s = '';
    for (const b of bytes) s += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    codes.push(`${s.slice(0, 4)}-${s.slice(4, 8)}`);
  }
  return codes;
}

export function normaliseBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normaliseBackupCode(code)).digest('hex');
}

/** Returns the index of the matching stored hash, or -1. */
export function findBackupCode(hashes: string[], code: string): number {
  const candidate = Buffer.from(hashBackupCode(code), 'hex');
  let found = -1;
  hashes.forEach((h, i) => {
    const stored = Buffer.from(h, 'hex');
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
      found = i;
    }
  });
  return found;
}
