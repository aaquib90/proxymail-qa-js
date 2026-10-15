import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ProxyMailQA, ProxyMailQAError } from '../src/index.ts';

const MATCH = { address: 'a@mailclub.dev', type: 'code', subtype: 'otp', value: '986512', service: 'Spotify' };

function client(responses: Response[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift()!);
  return { fetch, qa: new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test/', fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe('ProxyMailQA', () => {
  it('creates an address with the key as a bearer token', async () => {
    const { fetch, qa } = client([Response.json({ address: 'a@mailclub.dev' }, { status: 201 })]);
    expect((await qa.createAddress({ persona: true, lifetimeDays: 3 })).address).toBe('a@mailclub.dev');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/addresses');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer qa_test');
    expect(JSON.parse(String(init.body))).toEqual({ persona: true, lifetime_days: 3 });
  });

  it('waits for a code, passing since, service and link types along', async () => {
    const { fetch, qa } = client([Response.json(MATCH)]);
    const match = await qa.waitForCode('a@mailclub.dev', { since: new Date(0), service: 'spotify' });
    expect(match.value).toBe('986512');
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://api.test/v1/addresses/a%40mailclub.dev/code?timeout=30&service=spotify&since=1970-01-01T00%3A00%3A00.000Z',
    );
    const links = client([Response.json({ ...MATCH, type: 'link' })]);
    await links.qa.waitForLink('a@mailclub.dev', { type: ['verify', 'reset'], timeout: 5 });
    expect(String(links.fetch.mock.calls[0]![0])).toContain('/link?timeout=5&type=verify%2Creset');
  });

  it('keeps waiting past 30 seconds by repeating the request', async () => {
    vi.useFakeTimers();
    const timeout = () => Response.json({ error: 'not_found', message: 'No code arrived within 30 seconds.' }, { status: 404 });
    const { fetch, qa } = client([timeout(), Response.json(MATCH)]);
    const waiting = qa.waitForCode('a@mailclub.dev', { timeout: 60 });
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await waiting).value).toBe('986512');
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('sends persona options, app links and email content requests along', async () => {
    const create = client([Response.json({ address: 'a@mailclub.dev' }, { status: 201 })]);
    await create.qa.createAddress({ persona: true, age: 'under13', country: 'GB' });
    expect(JSON.parse(String((create.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ persona: true, age: 'under13', country: 'GB' });

    const link = client([Response.json({ ...MATCH, type: 'link', value: 'myapp://verify?t=1' })]);
    await link.qa.waitForLink('a@mailclub.dev', { app: true });
    expect(String(link.fetch.mock.calls[0]![0])).toContain('/link?timeout=30&app=true');

    const messages = client([Response.json([])]);
    await messages.qa.messages('a@mailclub.dev', { includeText: true, includeHtml: true });
    expect(String(messages.fetch.mock.calls[0]![0])).toBe('https://api.test/v1/addresses/a%40mailclub.dev/messages?include=text%2Chtml');
  });

  it('checks delivery, lists variants and saves a new password', async () => {
    const { fetch, qa } = client([
      Response.json({ address: 'a@mailclub.dev', emails: 0, refused: [], hint: 'Nothing has reached this address yet.' }),
      Response.json({ address: 'a@mailclub.dev', delivered: [{ tests: 'Capitals', address: 'A@MAILCLUB.DEV' }], undeliverable: [], invalid: [] }),
      Response.json({ address: 'a@mailclub.dev', label: 'password', saved: true, password: 'generated-once' }),
    ]);
    expect((await qa.checkDelivery('a@mailclub.dev')).hint).toMatch(/^Nothing has reached/);
    expect((await qa.variants('a@mailclub.dev')).delivered[0]!.address).toBe('A@MAILCLUB.DEV');
    expect((await qa.setPassword('a@mailclub.dev')).password).toBe('generated-once');
    const [url, init] = fetch.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/addresses/a%40mailclub.dev/password');
    expect(init.method).toBe('PUT');
  });

  it('types the password as a string when one is asked for or generated', () => {
    // Type checks only (pnpm typecheck); never called, so nothing is fetched.
    const types = (qa: ProxyMailQA) => {
      expectTypeOf(qa.createAddress({ persona: true, password: true })).resolves.toHaveProperty('password').toEqualTypeOf<string>();
      expectTypeOf(qa.createAddress({ persona: true })).resolves.toHaveProperty('password').toEqualTypeOf<string | undefined>();
      expectTypeOf(qa.setPassword('a@mailclub.dev')).resolves.toHaveProperty('password').toEqualTypeOf<string>();
      expectTypeOf(qa.setPassword('a@mailclub.dev', { password: 'Chosen-1' })).resolves.toHaveProperty('password').toEqualTypeOf<string | undefined>();
    };
    expect(types).toBeTypeOf('function');
  });

  it('counts emails with filters, and checks that none arrive', async () => {
    const summary = { received_at: '2026-10-15T10:00:01Z', service: 'Acme', service_domain: 'acme.example', type: 'link', subtype: 'verify', email_id: 'e1' };
    const { fetch, qa } = client([
      Response.json({ address: 'a@mailclub.dev', since: '2026-10-15T10:00:00.000Z', count: 1, emails: [summary] }),
      Response.json({ address: 'a@mailclub.dev', since: '2026-10-15T10:00:00.000Z', arrived: false, until: '2026-10-15T10:00:05.000Z' }),
      Response.json(
        { error: 'email_arrived', message: 'An email reached a@mailclub.dev since 2026-10-15T10:00:00.000Z, the first from Acme.', arrived: true, count: 1, email: summary },
        { status: 409 },
      ),
    ]);
    const since = new Date('2026-10-15T10:00:00Z');
    expect((await qa.countEmails('a@mailclub.dev', { since, type: 'link', subtype: ['verify', 'reset'], service: 'acme' })).count).toBe(1);
    expect(fetch.mock.calls[0]![0]).toBe('https://api.test/v1/addresses/a%40mailclub.dev/count?since=2026-10-15T10%3A00%3A00.000Z&service=acme&type=link&subtype=verify%2Creset');

    expect(await qa.expectNoEmail('a@mailclub.dev', { since, timeout: 0 })).toEqual({
      address: 'a@mailclub.dev',
      since: '2026-10-15T10:00:00.000Z',
      until: '2026-10-15T10:00:05.000Z',
    });
    expect(fetch.mock.calls[1]![0]).toBe('https://api.test/v1/addresses/a%40mailclub.dev/none?timeout=0&since=2026-10-15T10%3A00%3A00.000Z');

    const error = await qa.expectNoEmail('a@mailclub.dev', { since, timeout: 0 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProxyMailQAError);
    expect(error).toMatchObject({ status: 409, code: 'email_arrived', message: expect.stringMatching(/^An email reached/) });
  });

  it("keeps watching past 30 seconds from the server's own since", async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-15T10:00:00Z') });
    try {
      const fetch = vi.fn(async (url: string) => {
        // Each request holds for as long as it asked to.
        const seconds = Number(new URL(url).searchParams.get('timeout'));
        vi.setSystemTime(Date.now() + seconds * 1000);
        return Response.json({ address: 'a@mailclub.dev', since: '2026-10-15T09:59:59.000Z', arrived: false, until: new Date().toISOString() });
      });
      const qa = new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
      const result = await qa.expectNoEmail('a@mailclub.dev', { timeout: 45 });
      const urls = fetch.mock.calls.map(([url]) => new URL(url));
      expect(urls.map((u) => u.searchParams.get('timeout'))).toEqual(['30', '15']);
      // The first request lets the server pick since; the second reuses it.
      expect(urls.map((u) => u.searchParams.get('since'))).toEqual([null, '2026-10-15T09:59:59.000Z']);
      expect(result.since).toBe('2026-10-15T09:59:59.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it("says why a wait found nothing, and doesn't retry other 404s", async () => {
    const { qa } = client([
      Response.json(
        { error: 'not_found', message: 'No code arrived at a@mailclub.dev within 1 seconds.', hint: "Nothing has reached this address yet: the app's email provider may be in sandbox mode.", refused: [], help: 'https://proxymail.qa/troubleshooting' },
        { status: 404 },
      ),
    ]);
    const error = (await qa.waitForCode('a@mailclub.dev', { timeout: 0 }).catch((e: unknown) => e)) as ProxyMailQAError;
    expect(error.message).toMatch(/^No code arrived .* sandbox mode\.$/);
    expect(error).toMatchObject({ status: 404, refused: [], help: 'https://proxymail.qa/troubleshooting' });

    const missing = client([Response.json({ error: 'not_found', message: 'No such endpoint. See /v1/openapi.json.' }, { status: 404 })]);
    await expect(missing.qa.waitForCode('a@mailclub.dev', { timeout: 60 })).rejects.toThrow('No such endpoint');
    expect(missing.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws the API error with its status and code', async () => {
    const { qa } = client([Response.json({ error: 'forbidden', message: "This API key can't read saved passwords." }, { status: 403 })]);
    const error = await qa.savedPassword('a@mailclub.dev').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProxyMailQAError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
  });
});
