const POSSIBLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Largest multiple of the alphabet size (62) that fits in a byte. Bytes at or
// above this are rejected so the mapping to characters is uniform — modulo bias
// otherwise makes the first 256 % 62 = 8 characters slightly more likely.
const MAX_UNBIASED = Math.floor(256 / POSSIBLE.length) * POSSIBLE.length; // 248

// SECURITY (S7 — Trovida Tier-1 T1-5): the entropy source was `Math.random()`,
// a non-cryptographic PRNG whose output is predictable — and these ids include
// post `group` identifiers (the handle the S14 IDOR keys on), org invite codes,
// and other security-relevant tokens. This draws from a CSPRNG instead, with
// rejection sampling to avoid modulo bias.
//
// ISOMORPHIC ON PURPOSE — do NOT switch to `import { randomBytes } from 'crypto'`.
// makeId is imported by the frontend AND, transitively, by Temporal *workflow*
// files. A Node `crypto` import is a disallowed module in Temporal's
// deterministic workflow sandbox: the worker's webpack workflow-bundler rejects
// it ("importing the following disallowed modules: 'crypto'"), the orchestrator
// worker never initializes, and EVERY post silently sticks in QUEUE forever.
// Web Crypto `crypto.getRandomValues` is a CSPRNG that is present in the browser,
// in Node >= 20 as the WebCrypto global, and inside the Temporal sandbox — and
// pulls in no Node built-in, so the bundle compiles. (make.secure.id.ts uses the
// same isomorphic source.)
const randomBytesIsomorphic = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  // Web Crypto caps getRandomValues at 65,536 bytes per call; chunk for safety.
  for (let off = 0; off < n; off += 65536) {
    globalThis.crypto.getRandomValues(
      out.subarray(off, Math.min(off + 65536, n))
    );
  }
  return out;
};

/**
 * Random id over [A-Za-z0-9]. CSPRNG-backed (see the SECURITY note above).
 * Signature and alphabet are unchanged, so every caller is unaffected.
 */
export const makeId = (length: number): string => {
  if (length <= 0) {
    return '';
  }
  let text = '';
  while (text.length < length) {
    // Over-allocate to absorb the ~3% of bytes rejected for bias, so this
    // almost always completes in a single getRandomValues() call.
    const bytes = randomBytesIsomorphic((length - text.length) * 2);
    for (let i = 0; i < bytes.length && text.length < length; i += 1) {
      const b = bytes[i];
      if (b < MAX_UNBIASED) {
        text += POSSIBLE.charAt(b % POSSIBLE.length);
      }
    }
  }
  return text;
};
