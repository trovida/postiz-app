import { sign, verify } from 'jsonwebtoken';
import { hashSync, compareSync } from 'bcrypt';
import crypto from 'crypto';
// @ts-ignore
import EVP_BytesToKey from 'evp_bytestokey';
const algorithm = 'aes-256-cbc';
const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);

function deriveLegacyKeyIv(secret: string) {
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm); // 32, 16
  const pass = Buffer.isBuffer(secret) ? secret : Buffer.from(secret ?? '', 'utf8');

  // evp_bytestokey: key length in **bits**, IV length in **bytes**
  const { key, iv } = EVP_BytesToKey(pass, null, keyLength * 8, ivLength, 'md5');

  if (key.length !== keyLength || iv.length !== ivLength) {
    throw new Error(`Derived wrong sizes (key=${key.length}, iv=${iv.length})`);
  }
  return { key, iv };
}

export function decrypt_legacy_using_IV(hexCiphertext: string) {
  const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const out = Buffer.concat([decipher.update(hexCiphertext, 'hex'), decipher.final()]);
  return out.toString('utf8');
}

export function encrypt_legacy_using_IV(utf8Plaintext: string) {
  const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const out = Buffer.concat([cipher.update(utf8Plaintext, 'utf8'), cipher.final()]);
  return out.toString('hex');
}

// ── AES-256-GCM at rest (S6 — Trovida Tier-1 T1-4) ──────────────────────────
// The legacy scheme above is AES-256-CBC with a FIXED IV derived from
// JWT_SECRET via MD5: ciphertext is deterministic (equal plaintexts produce
// equal ciphertext — an equality oracle over merchant tokens) and it is keyed
// on the same JWT_SECRET used for every login/invite/reset token, so it defends
// nothing once that secret is known. GCM below uses a DISTINCT DATA_ENCRYPTION_KEY,
// a random 96-bit IV per encryption, and a 128-bit auth tag (tamper detection).
//
// Wire format:  v2:<base64( iv[12] | tag[16] | ciphertext )>
// The `v2:` prefix makes each stored value self-describing, so reads can accept
// both new-GCM and legacy-CBC during migration (backfill re-encrypts lazily on
// next write). New writes are always GCM.
const GCM_ALGO = 'aes-256-gcm';
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const GCM_PREFIX = 'v2:';
// A fixed, app-specific salt for scrypt when DATA_ENCRYPTION_KEY is a passphrase
// rather than raw 32 bytes. It is NOT a secret — its job is domain separation,
// not entropy (the key supplies the entropy).
const GCM_KDF_SALT = Buffer.from('trovida-postiz-data-key-v2', 'utf8');

function deriveDataKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    // Fail closed: never silently fall back to the weak JWT_SECRET-keyed scheme.
    throw new Error(
      'DATA_ENCRYPTION_KEY is not set — refusing to encrypt at rest with a weak key (S6)'
    );
  }
  // Accept a raw 32-byte key given as 64 hex chars or 44-char base64; otherwise
  // treat the value as a passphrase and scrypt-derive 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const b64 = (() => {
    try {
      const buf = Buffer.from(raw, 'base64');
      return buf.length === 32 ? buf : null;
    } catch {
      return null;
    }
  })();
  if (b64) {
    return b64;
  }
  return crypto.scryptSync(raw, GCM_KDF_SALT, 32);
}

export function encrypt_gcm(utf8Plaintext: string): string {
  const key = deriveDataKey();
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(GCM_ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(utf8Plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return GCM_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt_gcm(stored: string): string {
  const key = deriveDataKey();
  const raw = Buffer.from(stored.slice(GCM_PREFIX.length), 'base64');
  const iv = raw.subarray(0, GCM_IV_BYTES);
  const tag = raw.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
  const ct = raw.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
  const decipher = crypto.createDecipheriv(GCM_ALGO, key, iv);
  decipher.setAuthTag(tag);
  // Throws on a wrong key or tampered ciphertext (authenticated decryption).
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function isGcmCiphertext(value: string): boolean {
  return typeof value === 'string' && value.startsWith(GCM_PREFIX);
}

export class AuthService {
  static hashPassword(password: string) {
    return hashSync(password, 10);
  }
  static comparePassword(password: string, hash: string) {
    return compareSync(password, hash);
  }
  static signJWT(value: object) {
    return sign(value, process.env.JWT_SECRET!);
  }
  static verifyJWT(token: string) {
    return verify(token, process.env.JWT_SECRET!);
  }

  // S6 (T1-4): all NEW writes are GCM under DATA_ENCRYPTION_KEY. Every one of
  // the ~35 call sites goes through these two methods, so hardening the primitive
  // covers the whole DB-column surface at once.
  static fixedEncryption(value: string) {
    return encrypt_gcm(value);
  }

  // Reads accept both schemes so existing rows keep working during migration:
  // GCM (`v2:`) → authenticated decrypt; anything else → legacy CBC. Legacy rows
  // re-encrypt to GCM on their next write.
  static fixedDecryption(hash: string) {
    return isGcmCiphertext(hash)
      ? decrypt_gcm(hash)
      : decrypt_legacy_using_IV(hash);
  }
}
