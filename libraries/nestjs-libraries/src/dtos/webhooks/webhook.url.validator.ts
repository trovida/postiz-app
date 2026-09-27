import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

export function isBlockedIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);

  if ([a, b].some((n) => Number.isNaN(n))) return true;

  return (
    a === 0 ||                       // 0.0.0.0/8
    a === 10 ||                      // 10.0.0.0/8
    a === 127 ||                     // 127.0.0.0/8
    (a === 169 && b === 254) ||      // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||      // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    a >= 224                         // multicast/reserved
  );
}

/**
 * Expand any textual IPv6 (compressed `::`, uppercase, or with a dotted-quad
 * IPv4 tail) to its canonical 16 bytes. Returns null if it can't be parsed.
 *
 * SECURITY (S5 — T1-6): string-prefix matching on the un-canonicalized form is
 * the source of the bypass. `::ffff:7f00:1`, `::127.0.0.1`, `64:ff9b::7f00:1`
 * (NAT64) and `2002:7f00:1::` (6to4) all embed 127.0.0.1 but none start with a
 * blocked prefix, so the old check waved them through. Working on the bytes
 * closes every embedded-IPv4 scheme at once.
 */
export function ipv6ToBytes(ip: string): number[] | null {
  let s = ip.toLowerCase().trim().replace(/^\[|\]$/g, '');
  // Drop a zone id (fe80::1%eth0).
  const pct = s.indexOf('%');
  if (pct !== -1) s = s.slice(0, pct);

  // A trailing dotted-quad (…:a.b.c.d) becomes two hextets.
  const v4 = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const octets = v4[1].split('.').map(Number);
    if (octets.some((o) => o < 0 || o > 255 || Number.isNaN(o))) return null;
    const hex =
      ((octets[0] << 8) | octets[1]).toString(16) +
      ':' +
      ((octets[2] << 8) | octets[3]).toString(16);
    s = s.slice(0, v4.index) + hex;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      const n = parseInt(g, 16);
      out.push((n >> 8) & 0xff, n & 0xff);
    }
    return out;
  };

  const head = parseGroups(halves[0]);
  const tail = parseGroups(halves.length === 2 ? halves[1] : '');
  if (head === null || tail === null) return null;

  let bytes: number[];
  if (halves.length === 2) {
    const fill = 16 - head.length - tail.length;
    if (fill < 0) return null;
    bytes = [...head, ...new Array(fill).fill(0), ...tail];
  } else {
    bytes = head;
  }
  return bytes.length === 16 ? bytes : null;
}

export function isBlockedIPv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true; // unparseable → block (fail closed)

  const allZeroThrough = (n: number) => b.slice(0, n).every((x) => x === 0);
  const embeddedV4 = (start: number) =>
    isBlockedIPv4(`${b[start]}.${b[start + 1]}.${b[start + 2]}.${b[start + 3]}`);

  // ── Embedded-IPv4 schemes: extract the v4 and defer to the v4 verdict, so a
  //    genuinely public mapped address (::ffff:8.8.8.8) is still allowed. ──
  // IPv4-mapped ::ffff:0:0/96
  if (allZeroThrough(10) && b[10] === 0xff && b[11] === 0xff) {
    return embeddedV4(12);
  }
  // NAT64 well-known 64:ff9b::/96 — block the whole prefix (also catches the
  // 64:ff9b:1::/48 local-use variant since its high bytes match 64:ff9b).
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return true;
  }
  // 6to4 2002::/16 — embedded IPv4 sits at bytes 2..5.
  if (b[0] === 0x20 && b[1] === 0x02) {
    return embeddedV4(2);
  }
  // Teredo 2001:0000::/32 — tunnels to an arbitrary IPv4; block wholesale.
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) {
    return true;
  }
  // IPv4-compatible ::a.b.c.d/96 (deprecated) — e.g. ::127.0.0.1 → ::7f00:1.
  // Distinguish from :: (unspecified) and ::1 (loopback), both blocked below.
  if (allZeroThrough(12)) {
    // ::  and ::1 land here too; treat the whole ::/8-embedded space as v4.
    return embeddedV4(12) || (b[12] === 0 && b[13] === 0 && b[14] === 0);
  }

  // ── Pure-IPv6 special ranges (byte-range, not string-prefix). ──
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  if (b[0] === 0x00) return true; // ::/8 reserved (covers any leftover compat)

  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    return isBlockedIPv6(ip);
  }
  // Not a recognized IP literal — some textual v6 forms (e.g. `::127.0.0.1`)
  // are rejected by net.isIP but still route. Try the byte parser before
  // giving up; block anything still unparseable.
  return ipv6ToBytes(ip) ? isBlockedIPv6(ip) : true;
}

export async function isSafePublicHttpsUrl(value: unknown): Promise<boolean> {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  if (!parsed.hostname) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost') {
    return false;
  }

  // If user supplied a literal IP directly, validate it immediately
  const literalIpVersion = net.isIP(hostname);
  if (literalIpVersion) {
    return !isBlockedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true });

    if (!records.length) {
      return false;
    }

    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'IsSafeWebhookUrl', async: true })
export class IsSafeWebhookUrlConstraint implements ValidatorConstraintInterface {
  async validate(value: unknown, _args: ValidationArguments): Promise<boolean> {
    return isSafePublicHttpsUrl(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'URL must be a public HTTPS URL and must not resolve to localhost, private, loopback, or link-local addresses';
  }
}

export function IsSafeWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsSafeWebhookUrlConstraint,
    });
  };
}