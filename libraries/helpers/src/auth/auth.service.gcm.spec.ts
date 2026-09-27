import {
  encrypt_gcm,
  decrypt_gcm,
  isGcmCiphertext,
  encrypt_legacy_using_IV,
  AuthService,
} from './auth.service';

const SECRET = 'ya29.super-secret-oauth-token-value';

describe('at-rest encryption (S6 — T1-4: GCM under DATA_ENCRYPTION_KEY)', () => {
  const OLD_DEK = process.env.DATA_ENCRYPTION_KEY;
  const OLD_JWT = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'a-strong-passphrase-for-testing-only';
    process.env.JWT_SECRET = 'legacy-jwt-secret';
  });
  afterAll(() => {
    process.env.DATA_ENCRYPTION_KEY = OLD_DEK;
    process.env.JWT_SECRET = OLD_JWT;
  });

  it('roundtrips and stamps the v2: prefix', () => {
    const c = encrypt_gcm(SECRET);
    expect(isGcmCiphertext(c)).toBe(true);
    expect(c.startsWith('v2:')).toBe(true);
    expect(decrypt_gcm(c)).toBe(SECRET);
  });

  it('is non-deterministic — equal plaintexts produce different ciphertext', () => {
    expect(encrypt_gcm(SECRET)).not.toBe(encrypt_gcm(SECRET));
  });

  it('rejects tampered ciphertext via the auth tag', () => {
    const c = encrypt_gcm(SECRET);
    const raw = Buffer.from(c.slice(3), 'base64');
    raw[raw.length - 1] ^= 0x01;
    expect(() => decrypt_gcm('v2:' + raw.toString('base64'))).toThrow();
  });

  it('cannot be decrypted with a different DATA_ENCRYPTION_KEY', () => {
    const c = encrypt_gcm(SECRET);
    process.env.DATA_ENCRYPTION_KEY = 'a-completely-different-passphrase';
    expect(() => decrypt_gcm(c)).toThrow();
  });

  it('fails closed when DATA_ENCRYPTION_KEY is unset', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encrypt_gcm(SECRET)).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it('accepts a raw 32-byte key as hex or base64', () => {
    const raw = require('crypto').randomBytes(32) as Buffer;
    process.env.DATA_ENCRYPTION_KEY = raw.toString('hex');
    expect(decrypt_gcm(encrypt_gcm(SECRET))).toBe(SECRET);
    process.env.DATA_ENCRYPTION_KEY = raw.toString('base64');
    expect(decrypt_gcm(encrypt_gcm(SECRET))).toBe(SECRET);
  });

  describe('AuthService.fixedEncryption/fixedDecryption', () => {
    it('now writes GCM and reads it back', () => {
      const c = AuthService.fixedEncryption(SECRET);
      expect(isGcmCiphertext(c)).toBe(true);
      expect(AuthService.fixedDecryption(c)).toBe(SECRET);
    });

    it('still reads legacy CBC values (zero-downtime migration)', () => {
      const legacy = encrypt_legacy_using_IV(SECRET);
      expect(isGcmCiphertext(legacy)).toBe(false);
      expect(AuthService.fixedDecryption(legacy)).toBe(SECRET);
    });
  });
});
