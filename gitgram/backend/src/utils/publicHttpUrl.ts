import { isIP } from 'node:net';

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split('.').map(Number);
  const [first, second, third] = octets;

  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 192 && second === 88 && third === 99)
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('::ffff:')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8:');
}

/** Returns a canonical, externally addressable HTTP(S) URL or null. */
export function normalizePublicHttpUrl(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')) return null;

    const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ''));
    if ((ipVersion === 4 && isPrivateIpv4(hostname))
      || (ipVersion === 6 && isPrivateIpv6(hostname))) return null;

    return url.toString();
  } catch {
    return null;
  }
}
