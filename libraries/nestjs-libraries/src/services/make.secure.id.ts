const POSSIBLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Largest multiple of the alphabet size (62) that fits in a byte; bytes at or
// above it are rejected so the character mapping is unbiased.
const MAX_UNBIASED = Math.floor(256 / POSSIBLE.length) * POSSIBLE.length; // 248

// Credential-grade id: tokens, secrets, api keys, oauth state, PKCE verifiers.
// Every character comes from a CSPRNG. ISOMORPHIC via Web Crypto
// (`crypto.getRandomValues`, no Node `crypto` import) so it is also safe to
// reach from a Temporal workflow bundle — see the long note in make.is.ts for
// why a Node `crypto` import freezes all publishing. Uniform via rejection
// sampling.
export const makeSecureId = (length: number): string => {
  let text = '';
  while (text.length < length) {
    const out = new Uint8Array((length - text.length) * 2);
    globalThis.crypto.getRandomValues(out);
    for (let i = 0; i < out.length && text.length < length; i += 1) {
      const b = out[i];
      if (b < MAX_UNBIASED) {
        text += POSSIBLE.charAt(b % POSSIBLE.length);
      }
    }
  }
  return text;
};
