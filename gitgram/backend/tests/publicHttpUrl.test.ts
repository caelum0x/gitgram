import { normalizePublicHttpUrl } from '../src/utils/publicHttpUrl';

/**
 * Unit tests for the SSRF-protection URL normalizer used by the talent-graph
 * deliverable-URL flow (talentGraphController / talentGraphService).
 *
 * These lock in the security boundary: only externally addressable http(s)
 * URLs may pass; everything that could be used for SSRF (private ranges,
 * loopback, link-local, internal hostnames, credentialed URLs, non-http
 * schemes) must be rejected with `null`.
 */
describe('normalizePublicHttpUrl', () => {
  describe('accepts public http(s) URLs', () => {
    it('returns a canonical URL for a plain https host', () => {
      expect(normalizePublicHttpUrl('https://example.com/x')).toBe('https://example.com/x');
    });

    it('normalizes http hosts with a trailing slash on the path', () => {
      expect(normalizePublicHttpUrl('http://example.com')).toBe('http://example.com/');
    });

    it('trims surrounding whitespace before parsing', () => {
      expect(normalizePublicHttpUrl('  https://example.com/a  ')).toBe('https://example.com/a');
    });

    it('accepts public IPv4 literals', () => {
      expect(normalizePublicHttpUrl('http://8.8.8.8')).toBe('http://8.8.8.8/');
    });

    it('preserves query strings and paths', () => {
      expect(normalizePublicHttpUrl('https://example.com/path?a=1&b=2')).toBe(
        'https://example.com/path?a=1&b=2',
      );
    });
  });

  describe('rejects non-http(s) schemes', () => {
    it.each([
      'ftp://example.com',
      'file:///etc/passwd',
      'gopher://example.com',
      'data:text/plain;base64,aGVsbG8=',
      'javascript:alert(1)',
    ])('rejects %s', (value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });
  });

  describe('rejects credentialed URLs', () => {
    it('rejects URLs with username and password', () => {
      expect(normalizePublicHttpUrl('https://user:pass@example.com/')).toBeNull();
    });

    it('rejects URLs with a username only', () => {
      expect(normalizePublicHttpUrl('https://user@example.com/')).toBeNull();
    });
  });

  describe('rejects loopback and internal hostnames', () => {
    it.each([
      'http://localhost',
      'http://LOCALHOST/',
      'http://api.localhost',
      'http://service.local',
      'http://db.internal',
    ])('rejects %s', (value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });
  });

  describe('rejects private / reserved IPv4 ranges', () => {
    it.each([
      'http://127.0.0.1',
      'http://10.1.2.3',
      'http://172.16.0.1',
      'http://172.31.255.255',
      'http://192.168.1.1',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata endpoint
      'http://0.0.0.0',
      'http://100.64.0.1', // carrier-grade NAT
      'http://192.0.0.1',
      'http://198.18.0.1',
      'http://224.0.0.1', // multicast
    ])('rejects %s', (value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });
  });

  describe('rejects private / reserved IPv6 ranges', () => {
    it.each([
      'http://[::1]/', // loopback
      'http://[::]/', // unspecified
      'http://[fe80::1]/', // link-local
      'http://[fc00::1]/', // unique local
      'http://[fd12:3456::1]/', // unique local
      'http://[2001:db8::1]/', // documentation range
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
    ])('rejects %s', (value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });
  });

  describe('rejects empty / invalid input', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['garbage', 'not a url'],
    ])('rejects %s', (_label, value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['number', 123],
      ['object', {}],
    ])('rejects non-string %s', (_label, value) => {
      expect(normalizePublicHttpUrl(value)).toBeNull();
    });
  });
});
