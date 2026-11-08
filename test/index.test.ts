import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ProxyMailQA, ProxyMailQAError, type ChangeRequest, type CustomField } from '../src/index.ts';

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

  it("never shows its key when logged, a test's copy included", async () => {
    const key = 'qa_FAKE_key_never_real_42';
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json([]));
    const qa = new ProxyMailQA({ apiKey: key, baseUrl: 'https://api.test', fetch: fetch as unknown as typeof globalThis.fetch, run: 'run-1' });
    for (const shown of [qa, qa.forTest('signs up')]) {
      expect(inspect(shown, { showHidden: true, depth: 5 })).not.toContain(key);
      expect(JSON.stringify(shown)).not.toContain(key);
      expect(String(Object.values(shown))).not.toContain(key);
      expect(Object.keys(shown)).not.toContain('apiKey');
      await shown.listAddresses();
    }
    // It still sends it.
    expect(fetch.mock.calls.map(([, init]) => (init!.headers as Record<string, string>).Authorization)).toEqual([`Bearer ${key}`, `Bearer ${key}`]);
  });

  it('waits for a code, passing since, service and link types along', async () => {
    const { fetch, qa } = client([Response.json(MATCH)]);
    const match = await qa.waitForCode('a@mailclub.dev', { since: new Date(0), service: 'spotify' });
    expect(match.value).toBe('986512');
    expect(String(fetch.mock.calls[0]![0])).toBe(
      'https://api.test/v1/addresses/a%40mailclub.dev/code?timeout=30&service=spotify&since=1970-01-01T00%3A00%3A00.000Z',
    );
    const links = client([Response.json({ ...MATCH, type: 'link' }), Response.json({ ...MATCH, type: 'link' })]);
    await links.qa.waitForLink('a@mailclub.dev', { type: ['verify', 'reset'], timeout: 5 });
    expect(String(links.fetch.mock.calls[0]![0])).toContain('/link?timeout=5&type=verify%2Creset');
    await links.qa.waitForLink('a@mailclub.dev', { unused: true, timeout: 5 });
    expect(String(links.fetch.mock.calls[1]![0])).toContain('&unused=true');
  });

  it('waits for a coupon with type, and checks how soon an email came', async () => {
    const { fetch, qa } = client([
      Response.json({ ...MATCH, subtype: 'coupon', value: 'WELCOME20', discount: '20% off', valid_until: '2026-10-31', after_seconds: 212 }),
      Response.json({ address: 'a@mailclub.dev', passed: true, failed: [], warnings: [], checks: [] }),
    ]);
    const coupon = await qa.waitForCode('a@mailclub.dev', { type: 'coupon', since: new Date(0), timeout: 10 });
    expect(coupon).toMatchObject({ value: 'WELCOME20', discount: '20% off', valid_until: '2026-10-31', after_seconds: 212 });
    expect(String(fetch.mock.calls[0]![0])).toContain('&type=coupon');
    await qa.checkEmail('a@mailclub.dev', { since: new Date(0), expectWithin: '5m' });
    expect(String(fetch.mock.calls[1]![0])).toContain('expect_within=5m');
  });

  it('marks an address unsubscribed and subscribed again, and checks what came after', async () => {
    const watch = { id: 'w1', sender: 'acme.example', service: 'Acme', unsubscribed_at: '1970-01-01T00:00:00.000Z', via: 'api', watching: true, ended_at: null, after_unsubscribe: [] };
    const { fetch, qa } = client([Response.json(watch), Response.json({ ...watch, watching: false }), Response.json({ address: 'a@mailclub.dev', passed: true, watches: [watch] })]);
    await qa.markUnsubscribed('a@mailclub.dev', { service: 'acme.example', at: new Date(0) });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/addresses/a%40mailclub.dev/unsubscribed');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ service: 'acme.example', at: '1970-01-01T00:00:00.000Z' });
    expect((await qa.markResubscribed('a@mailclub.dev', { service: 'acme.example' })).watching).toBe(false);
    expect(String(fetch.mock.calls[1]![0])).toBe('https://api.test/v1/addresses/a%40mailclub.dev/unsubscribed?service=acme.example');
    expect((fetch.mock.calls[1]![1] as RequestInit).method).toBe('DELETE');
    expect((await qa.checkUnsubscribe('a@mailclub.dev')).passed).toBe(true);
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

  it('checks an email, passing the filters, the email and the expected host', async () => {
    const checks = {
      address: 'a@mailclub.dev',
      email: { id: 'e1', received_at: '2026-10-15T10:00:01Z', service: 'Acme', service_domain: 'acme.example', type: 'link', subtype: 'verify' },
      passed: true,
      failed: [],
      warnings: [],
      checks: [{ check: 'spf', status: 'pass', detail: 'The sending server is allowed to send for acme.example.' }],
    };
    const { fetch, qa } = client([Response.json(checks)]);
    expect(await qa.checkEmail('a@mailclub.dev', { type: 'link', emailId: 'e1', expectHost: 'staging.acme.example' })).toEqual(checks);
    expect(fetch.mock.calls[0]![0]).toBe('https://api.test/v1/addresses/a%40mailclub.dev/checks?email_id=e1&expect_host=staging.acme.example&type=link');
    const wording = client([Response.json(checks)]);
    await wording.qa.checkEmail('a@mailclub.dev', { expectText: ['Hallo Maya', 'Konto & Plan'], expectLanguage: 'de' });
    expect(wording.fetch.mock.calls[0]![0]).toBe(
      'https://api.test/v1/addresses/a%40mailclub.dev/checks?expect_language=de&expect_text=Hallo%20Maya&expect_text=Konto%20%26%20Plan',
    );
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

  it('finds addresses with filters', async () => {
    const { fetch, qa } = client([Response.json([]), Response.json([])]);
    await qa.listAddresses();
    expect(String(fetch.mock.calls[0]![0])).toBe('https://api.test/v1/addresses');
    await qa.listAddresses({ limit: 5, tags: ['age-gate', 'uk'], country: 'GB', minAge: 13, maxAge: 17, hasPassword: false, search: 'Jane' });
    expect(String(fetch.mock.calls[1]![0])).toBe(
      'https://api.test/v1/addresses?limit=5&tag=age-gate&tag=uk&country=GB&min_age=13&max_age=17&has_password=false&search=Jane',
    );
  });

  it('records where an address is used, finds by it, and signs in as a saved account', async () => {
    const { fetch, qa } = client([
      Response.json({ address: 'a@mailclub.dev', site: 'localhost:3000', environment: 'local' }, { status: 201 }),
      Response.json([]),
      Response.json({ address: 'a@mailclub.dev', password: 'Hunter2!', used_on_site: true }),
      Response.json({ error: 'not_found', message: 'No saved test account with a password fits.' }, { status: 404 }),
      Response.json({ dev_hosts: ['localhost:3000'] }),
    ]);
    await qa.createAddress({ site: 'http://localhost:3000/sign-up', environment: 'local' });
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ site: 'http://localhost:3000/sign-up', environment: 'local' });
    await qa.listAddresses({ site: 'localhost:3000', environment: 'local' });
    expect(String(fetch.mock.calls[1]![0])).toBe('https://api.test/v1/addresses?site=localhost%3A3000&environment=local');

    const account = await qa.signInAccount({ site: 'localhost:3000', tags: ['verified'] });
    expect(account).toMatchObject({ password: 'Hunter2!', used_on_site: true });
    const [url, init] = fetch.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/addresses/sign-in');
    expect(JSON.parse(String(init.body))).toEqual({ site: 'localhost:3000', tags: ['verified'] });
    expect(await qa.signInAccount()).toBeNull();

    expect(await qa.markDevHost('localhost:3000')).toEqual({ dev_hosts: ['localhost:3000'] });
    expect(String(fetch.mock.calls[4]![0])).toBe('https://api.test/v1/project/dev-hosts');
  });

  it('adds its calls to a run once one is started, and reports it', async () => {
    const run = { id: 'run-1', name: 'Sign-up tests', status: 'running', url: 'https://app.proxymail.qa/runs/run-1' };
    const { fetch, qa } = client([
      Response.json(run, { status: 201 }),
      Response.json({ address: 'a@mailclub.dev' }, { status: 201 }),
      new Response('### ✅ Sign-up tests passed\n', { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }),
      new Response(null, { status: 204 }),
      Response.json({ ...run, status: 'failed' }),
    ]);
    const headers = (i: number) => (fetch.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(qa.run).toBeNull();
    await qa.startRun({ name: 'Sign-up tests', source: 'ci', meta: { branch: 'main' } });
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ name: 'Sign-up tests', source: 'ci', meta: { branch: 'main' } });
    expect(headers(0)['Proxy-Mail-QA-Run']).toBeUndefined();
    await qa.createAddress();
    expect(headers(1)['Proxy-Mail-QA-Run']).toBe('run-1');
    expect(await qa.runReport()).toBe('### ✅ Sign-up tests passed\n');
    expect(String(fetch.mock.calls[2]![0])).toBe('https://api.test/v1/runs/run-1?format=markdown');
    await qa.addRunNote('Checkout failed', { failed: true });
    expect(JSON.parse(String((fetch.mock.calls[3] as unknown as [string, RequestInit])[1].body))).toEqual({ text: 'Checkout failed', failed: true });
    expect((await qa.finishRun({ failed: true })).status).toBe('failed');
    expect(String(fetch.mock.calls[4]![0])).toBe('https://api.test/v1/runs/run-1/finish');
    expect(qa.run).toBeNull();
    await expect(qa.finishRun()).rejects.toThrow(/No run/);
  });

  it('takes the run from PROXYMAIL_QA_RUN, and marks waits it will repeat', async () => {
    vi.stubEnv('PROXYMAIL_QA_RUN', 'run-ci');
    vi.useFakeTimers({ now: Date.parse('2026-10-17T10:00:00Z') });
    try {
      const answers = [Response.json({ error: 'not_found', message: 'No code arrived within 30 seconds.' }, { status: 404 }), Response.json(MATCH)];
      const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
        // Each request holds for as long as it asked to.
        vi.setSystemTime(Date.now() + Number(new URL(url).searchParams.get('timeout')) * 1000);
        return answers.shift()!;
      });
      const qa = new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test', fetch: fetch as unknown as typeof globalThis.fetch });
      expect(qa.run).toBe('run-ci');
      await qa.waitForCode('a@mailclub.dev', { timeout: 45 });
      const sent = fetch.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].headers as Record<string, string>);
      expect(sent.map((h) => h['Proxy-Mail-QA-Run'])).toEqual(['run-ci', 'run-ci']);
      // The first try isn't the last, so its "nothing arrived" isn't evidence.
      expect(sent.map((h) => h['Proxy-Mail-QA-Run-Retry'])).toEqual(['true', undefined]);
      expect(new ProxyMailQA({ apiKey: 'qa_test', run: null }).run).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it('checks an account out, extends it and always returns it', async () => {
    const account = { address: 'pool@mailclub.dev', tags: ['premium'], checkout: { token: 't1', until: 'x' } };
    const { fetch, qa } = client([
      Response.json(account),
      Response.json({ address: account.address, checkout: { token: 't1', until: 'y' } }),
      Response.json({ ...account, tags: ['premium', 'cancelled'] }),
    ]);
    const body = (i: number) => JSON.parse(String((fetch.mock.calls[i] as unknown as [string, RequestInit])[1].body));
    const result = await qa.withAccount({ tags: ['premium'], country: 'DE', maxAge: 17, minutes: 5 }, async (a) => {
      await qa.extendCheckout(a, 20);
      return { addTags: ['cancelled'] };
    });
    expect(result).toEqual({ addTags: ['cancelled'] });
    expect(String(fetch.mock.calls[0]![0])).toBe('https://api.test/v1/addresses/checkout');
    expect(body(0)).toEqual({ tags: ['premium'], country: 'DE', max_age: 17, minutes: 5 });
    expect(String(fetch.mock.calls[1]![0])).toBe('https://api.test/v1/addresses/pool%40mailclub.dev/extend');
    expect(body(1)).toEqual({ token: 't1', minutes: 20 });
    expect(String(fetch.mock.calls[2]![0])).toBe('https://api.test/v1/addresses/pool%40mailclub.dev/return');
    expect(body(2)).toEqual({ token: 't1', add_tags: ['cancelled'] });
  });

  it('returns the account even when the test throws', async () => {
    const account = { address: 'pool@mailclub.dev', checkout: { token: 't1', until: 'x' } };
    const { fetch, qa } = client([Response.json(account), Response.json(account)]);
    await expect(
      qa.withAccount({}, async () => {
        throw new Error('test failed');
      }),
    ).rejects.toThrow('test failed');
    expect(String(fetch.mock.calls[1]![0])).toContain('/return');
  });

  it("asks for the values of a sign-up form, in the API's field names", async () => {
    const answer = { address: 'new@mailclub.dev', created: true, persona: null, password: 'pw', values: [{ id: 'e', kind: 'email', value: 'new@mailclub.dev' }] };
    const { fetch, qa } = client([Response.json(answer, { status: 201 })]);
    expect(await qa.formValues({ fields: [{ id: 'e', type: 'email' }, { id: 'p', type: 'password', maxLength: 12 }], age: 'under18', country: 'GB' })).toEqual(answer);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/form-values');
    expect(JSON.parse(String(init.body))).toEqual({ fields: [{ id: 'e', type: 'email' }, { id: 'p', type: 'password', max_length: 12 }], age: 'under18', country: 'GB' });
  });

  it("sends a screen's own fields with the page and guess, and reads custom and guessed values", async () => {
    const answer = {
      address: 'a@mailclub.dev',
      created: false,
      persona: null,
      values: [
        { id: 'size', kind: 'custom', value: '11-50', rule: { id: 'f1', name: 'Company size' } },
        { id: 'terms', kind: 'custom', value: null, checked: true, rule: { id: 'f2', name: 'Terms' } },
        { id: 'seats', kind: 'guess', value: '5', from: 'type', note: 'Guessed from its type: check it suits your test.' },
      ],
    };
    const { fetch, qa } = client([Response.json(answer)]);
    const fields = [
      { id: 'size', type: 'select', testId: 'company-size', required: true, options: [{ value: '', label: 'Choose', disabled: true }, { value: '11-50' }] },
      { id: 'terms', type: 'checkbox', htmlId: 'terms' },
      { id: 'seats', type: 'number', min: 5, max: 9, step: 1 },
      { id: 'start', type: 'date', min: '2026-11-01' },
    ];
    const result = await qa.formValues({ fields, address: 'a@mailclub.dev', site: 'staging.example.com', page: '/signup/team', guess: 'required' });
    expect(result.values.map((v) => v.kind)).toEqual(['custom', 'custom', 'guess']);
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      fields: [
        { id: 'size', type: 'select', test_id: 'company-size', required: true, options: [{ value: '', label: 'Choose', disabled: true }, { value: '11-50' }] },
        { id: 'terms', type: 'checkbox', html_id: 'terms' },
        { id: 'seats', type: 'number', min: 5, max: 9, step: 1 },
        { id: 'start', type: 'date', min: '2026-11-01' },
      ],
      address: 'a@mailclub.dev',
      page: '/signup/team',
      guess: 'required',
      site: 'staging.example.com',
    });
  });

  it("lists, saves and removes the project's custom fields, and says when the leads were asked instead", async () => {
    const field = { id: 'f1', name: 'Company size', match: { on: 'test_id', text: 'company-size' }, value: { kind: 'option', option: '11-50' } };
    const request = { id: 'r1', kind: 'delete_custom_field', status: 'requested', summary: 'Company size' };
    const { fetch, qa } = client([
      Response.json({ guesses: 'all', locked: false, fields: [field], waiting: [] }),
      Response.json({ status: 'saved', field }, { status: 201 }),
      Response.json({ status: 'requested', request }, { status: 202 }),
      Response.json({ status: 'removed', id: 'f1' }),
    ]);
    expect((await qa.customFields()).fields).toEqual([field]);
    const saved = await qa.saveCustomField({
      name: 'Company size',
      match: { on: 'test_id', text: 'company-size' },
      site: 'staging.example.com',
      fieldType: 'select',
      value: { kind: 'option', option: '11-50' },
      tagAnswer: true,
    });
    expect(saved).toEqual({ status: 'saved', field });
    const asked = await qa.deleteCustomField('f1');
    expect(asked.status).toBe('requested');
    if (asked.status === 'requested') expectTypeOf(asked.request.summary).toEqualTypeOf<string>();
    expect(await qa.deleteCustomField('f1')).toEqual({ status: 'removed', id: 'f1' });
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET https://api.test/v1/project/custom-fields',
      'POST https://api.test/v1/project/custom-fields',
      'DELETE https://api.test/v1/project/custom-fields/f1',
      'DELETE https://api.test/v1/project/custom-fields/f1',
    ]);
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({
      name: 'Company size',
      match: { on: 'test_id', text: 'company-size' },
      site: 'staging.example.com',
      field_type: 'select',
      value: { kind: 'option', option: '11-50' },
      tag_answer: true,
    });
  });

  it("lists the project's sites, changes their sign-up screens and setting, and sends a native screen and a match's other phrases", async () => {
    const screen = { id: 's1', site_id: 'e1', kind: 'path', value: '/signup/team', label: 'Team details', status: 'kept' };
    const site = { id: 'e1', pattern: 'https://staging.example.com/*', environment: 'staging', multi_step: true, screens: [screen] };
    const request = { id: 'r1', kind: 'remove_signup_screen', status: 'requested', summary: '/signup/team' };
    const { fetch, qa } = client([
      Response.json({ locked: false, you_lead: true, sites: [site], app_screens: [], waiting: [] }),
      Response.json({ status: 'saved', site }),
      Response.json({ status: 'kept', screen }, { status: 201 }),
      Response.json({ status: 'kept', screen: { ...screen, site_id: null, kind: 'native', value: 'Team details', label: null } }),
      Response.json({ status: 'requested', request }, { status: 202 }),
      Response.json({ address: 'a@mailclub.dev', created: false, persona: null, values: [], screen: null }),
      Response.json({ status: 'saved', field: {} }, { status: 201 }),
    ]);
    expect((await qa.sites()).sites).toEqual([site]);
    expect(await qa.setMultiStep('staging.example.com', true)).toEqual({ status: 'saved', site });
    expect((await qa.saveSignupScreen({ site: 'staging.example.com', page: '/signup/team', label: 'Team details' })).status).toBe('kept');
    await qa.saveSignupScreen({ screen: 'Team details', label: null });
    const asked = await qa.removeSignupScreen('a/b');
    expect(asked.status).toBe('requested');
    if (asked.status === 'requested') expectTypeOf(asked.request.summary).toEqualTypeOf<string>();
    expect((await qa.formValues({ fields: [{ id: 'team', label: 'Team name' }], screen: 'Team details' })).screen).toBeNull();
    await qa.saveCustomField({
      name: 'Referral',
      match: { on: 'words', text: 'referral code', also: ['Empfehlungscode'] },
      value: { kind: 'text', text: 'QA' },
    });
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET https://api.test/v1/project/sites',
      'PATCH https://api.test/v1/project/sites',
      'POST https://api.test/v1/project/sites/screens',
      'POST https://api.test/v1/project/sites/screens',
      'DELETE https://api.test/v1/project/sites/screens/a%2Fb',
      'POST https://api.test/v1/form-values',
      'POST https://api.test/v1/project/custom-fields',
    ]);
    const body = (i: number) => JSON.parse(String(calls[i]![1].body)) as Record<string, unknown>;
    expect(body(1)).toEqual({ site: 'staging.example.com', multi_step: true });
    expect(body(2)).toEqual({ site: 'staging.example.com', page: '/signup/team', label: 'Team details' });
    expect(body(3)).toEqual({ screen: 'Team details', label: null });
    expect(body(5)).toEqual({ fields: [{ id: 'team', label: 'Team name' }], screen: 'Team details' });
    expect(body(6).match).toEqual({ on: 'words', text: 'referral code', also: ['Empfehlungscode'] });
  });

  // REST gives custom fields and requests without who made, asked for or
  // answered them, nor how and when (workers/mail/src/operations.ts's
  // shownField and shownRequest).
  it('types custom fields and requests with only the keys the API returns', () => {
    expectTypeOf<keyof CustomField>().toEqualTypeOf<'id' | 'name' | 'match' | 'site' | 'path' | 'field_type' | 'value' | 'tag_answer'>();
    expectTypeOf<keyof ChangeRequest>().toEqualTypeOf<'id' | 'kind' | 'target_id' | 'summary' | 'change' | 'note' | 'status' | 'reason'>();
  });

  it('changes the guesses setting with updateProject, and reads it from project()', async () => {
    const project = { id: 'p1', fill_unknown_fields: 'off', locked: false, custom_fields: 2, multi_step_sites: ['https://staging.example.com/*'] };
    const { fetch, qa } = client([Response.json(project), Response.json(project)]);
    expect((await qa.updateProject({ fillUnknownFields: 'off' })).fill_unknown_fields).toBe('off');
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ fill_unknown_fields: 'off' });
    expect((await qa.project()).multi_step_sites).toEqual(['https://staging.example.com/*']);
  });

  describe('prepared accounts (create, check and reset)', () => {
    const held = (address: string, token = 't1', tags = ['premium']) => ({ address, tags, persona: null, checkout: { token, until: 'x' } });
    const calls = (fetch: ReturnType<typeof client>['fetch']) =>
      fetch.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('https://api.test/v1', '')} ${init?.body ?? ''}`.trim());

    it('checks the account, runs the test, then resets and returns it', async () => {
      const { fetch, qa } = client([Response.json(held('p@mailclub.dev')), Response.json(held('p@mailclub.dev'))]);
      const order: string[] = [];
      const result = await qa.withAccount(
        {
          tags: ['premium'],
          check: async () => void order.push('check'),
          reset: async () => void order.push('reset'),
        },
        async () => {
          order.push('test');
          return 'done';
        },
      );
      expect(result).toBe('done');
      expect(order).toEqual(['check', 'test', 'reset']);
      expect(calls(fetch)).toEqual([
        'POST /addresses/checkout {"tags":["premium"]}',
        'POST /addresses/p%40mailclub.dev/return {"token":"t1"}',
      ]);
    });

    it('resets an account that fails its check, and skips one that still fails', async () => {
      const { fetch, qa } = client([
        Response.json(held('bad@mailclub.dev')),
        Response.json(held('bad@mailclub.dev')),
        Response.json(held('good@mailclub.dev', 't2')),
        Response.json(held('good@mailclub.dev', 't2')),
      ]);
      const resets: string[] = [];
      await qa.withAccount(
        {
          tags: ['premium'],
          check: async (a) => {
            if (a.address === 'bad@mailclub.dev') throw new Error('has 2 orders');
          },
          reset: async (a) => void resets.push(a.address),
        },
        async (a) => expect(a.address).toBe('good@mailclub.dev'),
      );
      expect(resets).toEqual(['bad@mailclub.dev', 'good@mailclub.dev']);
      expect(calls(fetch)).toEqual([
        'POST /addresses/checkout {"tags":["premium"]}',
        'POST /addresses/bad%40mailclub.dev/return {"token":"t1","add_tags":["check-failed"],"remove_tags":["premium"]}',
        'POST /addresses/checkout {"tags":["premium"]}',
        'POST /addresses/good%40mailclub.dev/return {"token":"t2"}',
      ]);
    });

    it('makes a new account when none is free, holding it while create runs', async () => {
      const { fetch, qa } = client([
        Response.json({ error: 'all_checked_out', message: 'All 2 matching accounts are checked out' }, { status: 409 }),
        Response.json({ address: 'new@mailclub.dev', tags: [], password: 'pw-123', persona: { first_name: 'Ada', last_name: 'L', username: 'ada' } }, { status: 201 }),
        Response.json(held('new@mailclub.dev', 't9', [])),
        Response.json({ address: 'new@mailclub.dev', tags: ['premium'], persona: null }),
        Response.json(held('new@mailclub.dev', 't9')),
      ]);
      const made: string[] = [];
      await qa.withAccount(
        {
          tags: ['Premium'],
          country: 'GB',
          create: async (a) => void made.push(`${a.address} ${a.password}`),
          check: async (a) => a.tags.includes('premium'),
        },
        async (a) => expect(a).toMatchObject({ address: 'new@mailclub.dev', tags: ['premium'], checkout: { token: 't9' } }),
      );
      expect(made).toEqual(['new@mailclub.dev pw-123']);
      expect(calls(fetch)).toEqual([
        'POST /addresses/checkout {"tags":["Premium"],"country":"GB"}',
        'POST /addresses {"password":true,"country":"GB"}',
        'POST /addresses/checkout {"search":"new@mailclub.dev"}',
        'PATCH /addresses/new%40mailclub.dev {"tags":["premium"]}',
        'POST /addresses/new%40mailclub.dev/return {"token":"t9"}',
      ]);
    });

    it('keeps a new account out of the pool when create fails', async () => {
      const { fetch, qa } = client([
        Response.json({ error: 'not_found', message: 'No account matches these filters' }, { status: 404 }),
        Response.json({ address: 'new@mailclub.dev', tags: [], password: 'pw' }, { status: 201 }),
        Response.json(held('new@mailclub.dev', 't9', [])),
        Response.json({ address: 'new@mailclub.dev', tags: [] }),
        Response.json(held('new@mailclub.dev', 't9', [])),
      ]);
      const failed = qa.withAccount(
        {
          tags: ['verified'],
          create: async () => {
            throw new Error('sign-up form changed');
          },
        },
        async () => 'never',
      );
      await expect(failed).rejects.toThrow('sign-up form changed');
      expect(calls(fetch).slice(3)).toEqual(['PATCH /addresses/new%40mailclub.dev {"tags":[]}', 'POST /addresses/new%40mailclub.dev/return {"token":"t9"}']);
    });

    it('takes an account out of the pool when reset fails', async () => {
      const { fetch, qa } = client([Response.json(held('p@mailclub.dev')), Response.json(held('p@mailclub.dev'))]);
      const failed = qa.withAccount(
        {
          tags: ['premium'],
          reset: async () => {
            throw new Error('admin API down');
          },
        },
        async () => ({ addTags: ['cancelled'] }),
      );
      await expect(failed).rejects.toThrow('admin API down');
      expect(calls(fetch)[1]).toBe('POST /addresses/p%40mailclub.dev/return {"token":"t1","add_tags":["cancelled","needs-reset"],"remove_tags":["premium"]}');
    });

    it('says why when no account passes and none can be made', async () => {
      const { qa } = client([
        Response.json(held('a@mailclub.dev')),
        Response.json(held('a@mailclub.dev')),
        Response.json(held('a@mailclub.dev', 't2')),
        Response.json(held('a@mailclub.dev', 't2')),
      ]);
      const failed = qa.withAccount({ tags: ['premium'], check: async () => false }, async () => 'never');
      await expect(failed).rejects.toThrow('No test account passed the check: tried a@mailclub.dev (last: check returned false). Pass create to make one.');
    });

    it('asks for an age when new accounts must match one', async () => {
      const { qa } = client([Response.json({ error: 'not_found', message: 'No account matches' }, { status: 404 })]);
      await expect(qa.withAccount({ maxAge: 17, create: async () => {} }, async () => 'never')).rejects.toThrow('Give newAccount an age or dateOfBirth');
    });
  });

  it('throws the API error with its status and code', async () => {
    const { qa } = client([Response.json({ error: 'forbidden', message: "This API key can't read saved passwords." }, { status: 403 })]);
    const error = await qa.savedPassword('a@mailclub.dev').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProxyMailQAError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
  });
});

// The README and these comments go to npm, so they say what the API and
// Proxy Mail QA for Chrome do now.
describe('the README and the comments', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  // Each run of // comment lines, and each of the README's paragraphs outside
  // its code, as one text with its lines joined.
  const texts = (file: string, prose: boolean) => {
    const found: string[] = [];
    let lines: string[] = [];
    let code = false;
    const end = () => {
      if (lines.length) found.push(lines.join(' '));
      lines = [];
    };
    for (const line of file.split('\n')) {
      const comment = /^\s*\/\/\s?(.*)$/.exec(line);
      if (line.startsWith('```')) {
        end();
        code = !code;
      } else if (comment) lines.push(comment[1]!.trim());
      else if (prose && !code && line.trim()) lines.push(line.trim());
      else end();
    }
    end();
    return found;
  };
  const blocks = [...texts(read('../README.md'), true), ...texts(read('../src/index.ts'), false)];
  const sentences = blocks.flatMap((text) => text.split(/(?<=[.!?])\s+/));

  // Owner, 6 Nov 2026: custom fields, guesses and filling later screens by
  // themselves came with Proxy Mail QA for Chrome 0.9.0. Codes and links it
  // filled before.
  it('name Chrome 0.9.0 and later wherever they say Chrome fills custom fields, guesses or screens', () => {
    const claims = sentences.filter(
      (s) => s.includes('Proxy Mail QA for Chrome') && /\b(?:fill\w*|guess\w*|screens?)\b/i.test(s) && !/\b(?:code|link)s?\b/.test(s),
    );
    expect(claims.length).toBeGreaterThanOrEqual(6);
    for (const claim of claims) expect(claim).toContain('Proxy Mail QA for Chrome 0.9.0 and later');
  });

  // Free's 500 in total answer 402 plan_required, the day's 50 answer 429
  // daily_limit (docs/limits.md).
  it("give the day's limit as a 429 daily_limit, never a 402", () => {
    const limits = blocks.filter((b) => /\b402\b/.test(b) && /\b50 a day\b|\bday's 50\b|\bdaily\b/.test(b));
    expect(limits.length).toBeGreaterThanOrEqual(2);
    for (const block of limits) {
      expect(block).toMatch(/\b402\b[^.;]*\bplan_required\b/);
      expect(block).toMatch(/\b429\b[^.;]*\bdaily_limit\b/);
    }
  });

  // On a locked project a lead's change is made straight away; only a key
  // whose creator isn't a lead asks the leads.
  it('say a change asks the leads only when your key’s creator isn’t one', () => {
    const asks = sentences.filter((s) => /\bask(?:s)? (?:the leads|them) instead\b|\bleads are asked\b|\brequest to the leads instead\b/.test(s));
    expect(asks.length).toBeGreaterThanOrEqual(5);
    for (const sentence of asks) expect(sentence).toMatch(/\byou_lead\b|\bleads it\b|\bisn't (?:one|a lead)\b/);
  });

  // formValues adds the page or screen a sign-up is on as suggested only while
  // the list has room: at 20 it adds nothing (owner, 6 Nov 2026). A native
  // screen with no site of the project goes to its app screens, which also
  // hold 20, as the API's own form_values text says.
  it('say a screen formValues adds as suggested is added unless the list is full (20)', () => {
    const adds = sentences.filter((s) => /\badd(?:s|ed)\b[^.]*\bas suggested\b/.test(s));
    expect(adds.length).toBeGreaterThanOrEqual(1);
    for (const sentence of adds) expect(sentence).toContain('unless the list is full (20)');
    const native = adds.filter((s) => s.includes('native app screen'));
    expect(native.length).toBeGreaterThanOrEqual(1);
    for (const sentence of native) expect(sentence).toMatch(/\bon a sign-up\b.*\bor to the project's app screens when no site matches\b/);
  });
});
