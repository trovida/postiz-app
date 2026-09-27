import {
  isBlockedIp,
  isBlockedIPv6,
  ipv6ToBytes,
} from './webhook.url.validator';

describe('SSRF IP guard (S5 — T1-6: embedded-IPv4 canonicalization)', () => {
  describe('the bypasses panel correction #1 called out — must now BLOCK', () => {
    const bypasses = [
      '::ffff:7f00:1', // hex-form ::ffff:127.0.0.1
      '::ffff:127.0.0.1', // dotted mapped loopback
      '::127.0.0.1', // IPv4-compatible loopback
      '::ffff:a9fe:1', // mapped 169.254.0.1 (link-local)
      '64:ff9b::7f00:1', // NAT64 -> 127.0.0.1
      '64:ff9b::c0a8:1', // NAT64 -> 192.168.0.1
      '2002:7f00:1::', // 6to4 -> 127.0.0.1
      '2002:c0a8:1::', // 6to4 -> 192.168.0.1
      '2001:0000:4136:e378:8000:63bf:3fff:fdd2', // Teredo /32
      '::ffff:0a00:1', // mapped 10.0.0.1
    ];
    it.each(bypasses)('blocks %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });
  });

  describe('classic special ranges — BLOCK', () => {
    const blocked = [
      '::1',
      '::',
      'fe80::1',
      'FE80::1',
      'fc00::1',
      'fd12:3456::1',
      'ff02::1',
      '0:0:0:0:0:0:0:1',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '169.254.1.1',
      '172.16.5.5',
      '100.64.0.1',
      '0.0.0.0',
    ];
    it.each(blocked)('blocks %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });
  });

  describe('legitimate public addresses — ALLOW', () => {
    const allowed = [
      '8.8.8.8',
      '1.1.1.1',
      '::ffff:8.8.8.8', // mapped public v4
      '::ffff:0808:0808', // hex mapped public
      '2606:4700:4700::1111', // Cloudflare v6
      '2001:4860:4860::8888', // Google v6
    ];
    it.each(allowed)('allows %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    });
  });

  describe('unparseable / junk — BLOCK (fail closed)', () => {
    it.each(['not-an-ip', ':::', '12345::'])('blocks %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });
  });

  describe('ipv6ToBytes', () => {
    it('expands compressed and dotted-tail forms to 16 bytes', () => {
      expect(ipv6ToBytes('::1')).toHaveLength(16);
      expect(ipv6ToBytes('::ffff:127.0.0.1')?.slice(12)).toEqual([
        127, 0, 0, 1,
      ]);
      expect(ipv6ToBytes('2002:c0a8:1::')?.slice(2, 6)).toEqual([
        192, 168, 0, 1,
      ]);
    });
    it('returns null for malformed input', () => {
      expect(ipv6ToBytes(':::')).toBeNull();
      expect(ipv6ToBytes('12345::')).toBeNull();
      expect(ipv6ToBytes('gg::')).toBeNull();
    });
  });

  it('isBlockedIPv6 fails closed on unparseable input', () => {
    expect(isBlockedIPv6('nonsense')).toBe(true);
  });
});
