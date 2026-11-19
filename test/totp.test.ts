// FM-3 (SID-218): totpCode, worked out locally. RFC 6238's test values
// (appendix B), with its three keys in base32.
import { describe, expect, it, vi } from 'vitest';
import { ProxyMailQA, totpCode } from '../src/index.ts';

const SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====';
const SHA512 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=';

describe('totpCode', () => {
  it("gives RFC 6238's codes", async () => {
    const at = (seconds: number) => seconds * 1000;
    const rows: Array<[string, 'SHA-1' | 'SHA-256' | 'SHA-512', number, string]> = [
      [SHA1, 'SHA-1', 59, '94287082'],
      [SHA1, 'SHA-1', 1111111109, '07081804'],
      [SHA1, 'SHA-1', 1234567890, '89005924'],
      [SHA1, 'SHA-1', 20000000000, '65353130'],
      [SHA256, 'SHA-256', 59, '46119246'],
      [SHA256, 'SHA-256', 1111111109, '68084774'],
      [SHA512, 'SHA-512', 59, '90693936'],
      [SHA512, 'SHA-512', 1111111109, '25091201'],
    ];
    for (const [secret, algorithm, seconds, code] of rows)
      expect(await totpCode(secret, { algorithm, digits: 8, at: at(seconds) }), `${algorithm} ${seconds}`).toBe(code);
  });

  it('gives six digits by default, from a key written as apps show it', async () => {
    expect(await totpCode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', { at: new Date(59_000) })).toBe('287082');
    expect(await totpCode(SHA1, { at: 1111111109_000 })).toBe('081804');
  });

  it('reads the secret, digits, period and algorithm from an otpauth:// address', async () => {
    const uri = `otpauth://totp/Acme:jane%40mailclub.dev?secret=${SHA256.replace(/=/g, '')}&issuer=Acme&algorithm=SHA256&digits=8&period=30`;
    expect(await totpCode(uri, { at: 59_000 })).toBe('46119246');
    // Given options win over the address.
    expect(await totpCode(uri, { at: 59_000, digits: 6 })).toBe('119246');
  });

  it('refuses what is not a TOTP secret', async () => {
    await expect(totpCode('')).rejects.toThrow(/empty/);
    await expect(totpCode('not-base32!')).rejects.toThrow(/base32/);
    await expect(totpCode('otpauth://hotp/Acme?secret=GEZA&counter=1')).rejects.toThrow(/time-based/);
    await expect(totpCode('otpauth://totp/Acme?issuer=Acme')).rejects.toThrow(/no secret/);
    await expect(totpCode(SHA1, { digits: 4 })).rejects.toThrow(/digits/);
  });

  it('waits for the next code when this one is about to run out', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(29_000);
      const next = totpCode(SHA1, { digits: 8, minSecondsLeft: 5 });
      await vi.advanceTimersByTimeAsync(2_000);
      // 30 s on, the window that starts at 30.
      expect(await next).toBe(await totpCode(SHA1, { digits: 8, at: 30_000 }));
      vi.setSystemTime(40_000);
      expect(await totpCode(SHA1, { digits: 8, minSecondsLeft: 5 })).toBe(await totpCode(SHA1, { digits: 8, at: 40_000 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('is on the client too, and never calls the API', async () => {
    const fetch = vi.fn();
    const qa = new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await qa.totpCode(SHA1, { digits: 8, at: 59_000 })).toBe('94287082');
    expect(fetch).not.toHaveBeenCalled();
  });
});
