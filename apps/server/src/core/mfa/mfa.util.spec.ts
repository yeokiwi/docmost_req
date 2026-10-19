import * as OTPAuth from 'otpauth';
import {
  findBackupCode,
  generateBackupCodes,
  hashBackupCode,
  newTotpSecret,
  verifyTotp,
} from './mfa.util';

describe('mfa utils', () => {
  it('verifies current TOTP codes and rejects others', () => {
    const secret = newTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const code = totp.generate();
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, ` ${code.slice(0, 3)} ${code.slice(3)} `)).toBe(true);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(verifyTotp(secret, wrong)).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    // one step of drift is accepted, three are not
    const old = totp.generate({ timestamp: Date.now() - 30_000 });
    expect(verifyTotp(secret, old)).toBe(true);
    const tooOld = totp.generate({ timestamp: Date.now() - 120_000 });
    expect(verifyTotp(secret, tooOld)).toBe(tooOld === code);
  });

  it('generates unique, readable backup codes and matches them loosely', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/));

    const hashes = codes.map(hashBackupCode);
    expect(findBackupCode(hashes, codes[3].toUpperCase().replace('-', ' '))).toBe(3);
    expect(findBackupCode(hashes, 'zzzz-zzzz')).toBe(-1);
  });
});
