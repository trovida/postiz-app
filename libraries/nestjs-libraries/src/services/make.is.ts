import { randomBytes } from 'crypto';

const POSSIBLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Largest multiple of the alphabet size (62) that fits in a byte. Bytes at or
// above this are rejected so the mapping to characters is uniform — modulo bias
// otherwise makes the first 256 % 62 = 8 characters slightly more likely.
const MAX_UNBIASED = Math.floor(256 / POSSIBLE.length) * POSSIBLE.length; // 248

/**
 * Random id over [A-Za-z0-9].
 *
 * SECURITY (S7 — Trovida Tier-1 T1-5): the entropy source was `Math.random()`,
 * a non-cryptographic PRNG whose output is predictable — and these ids include
 * post `group` identifiers (the handle the S14 IDOR keys on), org invite codes,
 * and other security-relevant tokens. This now draws from `crypto.randomBytes`
 * (CSPRNG) with rejection sampling to avoid modulo bias. Signature and alphabet
 * are unchanged, so every caller is unaffected — only the randomness improves.
 */
export const makeId = (length: number): string => {
  if (length <= 0) {
    return '';
  }
  let text = '';
  while (text.length < length) {
    // Over-allocate to absorb the ~3% of bytes rejected for bias, so this
    // almost always completes in a single randomBytes() call.
    const bytes = randomBytes((length - text.length) * 2);
    for (let i = 0; i < bytes.length && text.length < length; i += 1) {
      const b = bytes[i];
      if (b < MAX_UNBIASED) {
        text += POSSIBLE.charAt(b % POSSIBLE.length);
      }
    }
  }
  return text;
};
