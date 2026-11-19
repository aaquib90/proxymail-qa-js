import { describe, expect, it, vi } from 'vitest';
import { parseFlags, runCli, type CliIo } from '../src/cli-main.ts';
import { ProxyMailQA } from '../src/index.ts';

const KEY = 'qa_FAKE_cli_key';
const CREATED = {
  address: 'k7f2@mailclub.dev',
  password: 'Pw-1234-abcd',
  expires_at: '2026-11-16T18:00:00Z',
  persona: { first_name: 'Ayesha', last_name: 'Khan', username: 'ayesha_k42', date_of_birth: '1994-03-06', country: 'PK' },
};
const MATCH = { address: 'k7f2@mailclub.dev', type: 'code', subtype: 'otp', value: '986512', service: 'Acme', expires_at: '2026-11-13T18:10:00Z' };

function setup(responses: Response[], options: { tty?: boolean; env?: Record<string, string>; files?: Record<string, string>; stdin?: string } = {}) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift() ?? Response.json({}));
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    env: options.env ?? { PROXYMAIL_QA_API_KEY: KEY },
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    tty: options.tty ?? false,
    readFile: async (path) => {
      const text = options.files?.[path];
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    readStdin: async () => options.stdin ?? '',
    version: '0.13.0',
    client: (o) => new ProxyMailQA({ ...o, baseUrl: 'https://api.test', run: null, fetch: fetch as unknown as typeof globalThis.fetch }),
  };
  const call = (n: number) => {
    const [url, init] = fetch.mock.calls[n] as unknown as [string, RequestInit];
    return {
      url,
      method: init.method,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init.headers as Record<string, string>).Authorization,
    };
  };
  return { io, out, err, fetch, call };
}

describe('proxymail-qa command', () => {
  it('makes an address with a persona and prints the address and password for a script', async () => {
    const { io, out, call } = setup([Response.json(CREATED, { status: 201 })]);
    expect(await runCli(['new', '--password', '--country', 'pk', '--age', 'adult', '--site=staging.acme.dev'], io)).toBe(0);
    expect(out).toEqual(['k7f2@mailclub.dev\nPw-1234-abcd']);
    expect(call(0)).toMatchObject({ url: 'https://api.test/v1/addresses', method: 'POST', auth: `Bearer ${KEY}` });
    expect(call(0).body).toEqual({ persona: true, password: true, country: 'PK', age: 'adult', site: 'staging.acme.dev' });
  });

  it('labels everything in a terminal, and gives JSON when asked', async () => {
    const tty = setup([Response.json(CREATED, { status: 201 })], { tty: true });
    await runCli(['new', '--password'], tty.io);
    expect(tty.out[0]).toBe(
      [
        'Address        k7f2@mailclub.dev',
        'Password       Pw-1234-abcd',
        'First name     Ayesha',
        'Last name      Khan',
        'Username       ayesha_k42',
        'Date of birth  1994-03-06',
        'Country        PK',
        'Lasts until    2026-11-16T18:00:00Z',
      ].join('\n'),
    );
    const json = setup([Response.json(CREATED, { status: 201 })]);
    await runCli(['new', '--json'], json.io);
    expect(JSON.parse(json.out[0]!)).toEqual(CREATED);
  });

  it('turns the persona off, and sends one name only when asked', async () => {
    const { io, call } = setup([Response.json(CREATED), Response.json(CREATED)]);
    await runCli(['new', '--no-persona', '--days', '3'], io);
    await runCli(['new', '--one-name', '--dob', '2000-01-31'], io);
    expect(call(0).body).toEqual({ persona: false, lifetime_days: 3 });
    expect(call(1).body).toEqual({ persona: true, one_name: true, date_of_birth: '2000-01-31' });
  });

  it('waits for a code and prints just the code when piped', async () => {
    const { io, out, err, call } = setup([Response.json(MATCH)]);
    expect(await runCli(['wait-code', 'k7f2@mailclub.dev', '--timeout', '20', '--service', 'acme', '--unused'], io)).toBe(0);
    expect(out).toEqual(['986512']);
    expect(err).toEqual(['Waiting for a code…']);
    expect(call(0).url).toBe('https://api.test/v1/addresses/k7f2%40mailclub.dev/code?timeout=20&service=acme&unused=true');
  });

  it('waits for a link of several types, the app link when asked', async () => {
    const { io, out, call } = setup([Response.json({ ...MATCH, type: 'link', value: 'https://staging.acme.dev/verify?t=1' })]);
    await runCli(['wait-link', 'k7f2@mailclub.dev', '--type', 'verify,magic_signin', '--app', '--since', '2026-11-13T18:00:00Z'], io);
    expect(out).toEqual(['https://staging.acme.dev/verify?t=1']);
    expect(call(0).url).toBe(
      'https://api.test/v1/addresses/k7f2%40mailclub.dev/link?timeout=30&since=2026-11-13T18%3A00%3A00.000Z&type=verify%2Cmagic_signin&app=true',
    );
  });

  it('labels a match in a terminal, with a failed link check', async () => {
    const link_site = { status: 'fail', problem: 'local', site: 'staging.acme.dev', goes_to: 'localhost:3000', detail: 'The link goes to localhost:3000.' };
    const { io, out } = setup([Response.json({ ...MATCH, link_site })], { tty: true });
    await runCli(['wait-code', 'k7f2@mailclub.dev'], io);
    expect(out[0]).toBe(
      ['Code        986512', 'From        Acme', 'Expires     2026-11-13T18:10:00Z', 'Link check  The link goes to localhost:3000.'].join('\n'),
    );
  });

  it('says why nothing arrived and exits 1', async () => {
    const { io, out, err } = setup([
      Response.json(
        { error: 'not_found', message: 'No code arrived in 0 s.', hint: 'Check the app sent it.', help: 'https://proxymail.qa/docs/troubleshooting' },
        { status: 404 },
      ),
    ]);
    // --timeout 0: no second try.
    expect(await runCli(['wait-code', 'k7f2@mailclub.dev', '--timeout', '0'], io)).toBe(1);
    expect(out).toEqual([]);
    expect(err.at(-1)).toBe('No code arrived in 0 s. Check the app sent it.\nMore: https://proxymail.qa/docs/troubleshooting');
  });

  it('says why a file couldn’t be read, or the API couldn’t be reached, and exits 1', async () => {
    const { io, out, err, fetch } = setup([]);
    expect(await runCli(['form-values', 'missing.json'], io)).toBe(1);
    expect(err[0]).toBe("ENOENT: no such file, open 'missing.json'");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await runCli(['new'], io)).toBe(1);
    expect(err[1]).toBe('fetch failed');
    fetch.mockRejectedValueOnce('offline');
    expect(await runCli(['persona', 'k7f2@mailclub.dev'], io)).toBe(1);
    expect(err[2]).toBe('offline');
    expect(out).toEqual([]);
  });

  it('shows a persona', async () => {
    const { io, out, call } = setup([
      Response.json({ address: CREATED.address, persona: CREATED.persona }),
      Response.json({ address: 'b@mailclub.dev', persona: null }),
    ]);
    await runCli(['persona', 'k7f2@mailclub.dev'], io);
    expect(out[0]).toBe('First name     Ayesha\nLast name      Khan\nUsername       ayesha_k42\nDate of birth  1994-03-06\nCountry        PK');
    expect(call(0)).toMatchObject({ url: 'https://api.test/v1/addresses/k7f2%40mailclub.dev', method: 'GET' });
    await runCli(['persona', 'b@mailclub.dev'], io);
    expect(out[1]).toBe('No persona on this address.');
  });

  it('gives form values for a file of fields, flags over the file', async () => {
    const file = JSON.stringify({
      fields: [
        { id: 'e', type: 'email', label: 'Email' },
        { id: 'n', label: 'Name (Urdu)', maxLength: 40 },
      ],
      country: 'GB',
      page: '/signup',
    });
    const answer = { address: 'k7f2@mailclub.dev', created: true, persona: CREATED.persona, values: [{ id: 'e', kind: 'email', value: 'k7f2@mailclub.dev' }] };
    const { io, out, call } = setup([Response.json(answer)], { files: { 'form.json': file } });
    expect(await runCli(['form-values', 'form.json', '--country', 'pk', '--site', 'staging.acme.dev'], io)).toBe(0);
    expect(JSON.parse(out[0]!)).toEqual(answer);
    expect(call(0).body).toEqual({
      fields: [
        { id: 'e', type: 'email', label: 'Email' },
        { id: 'n', label: 'Name (Urdu)', max_length: 40 },
      ],
      country: 'PK',
      page: '/signup',
      site: 'staging.acme.dev',
    });
  });

  it('reads a list of fields from standard input', async () => {
    const { io, call } = setup([Response.json({ values: [] })], { stdin: '[{"id":"u","autocomplete":"username"}]' });
    await runCli(['form-values', '-', '--address', 'k7f2@mailclub.dev'], io);
    expect(call(0).body).toEqual({ fields: [{ id: 'u', autocomplete: 'username' }], address: 'k7f2@mailclub.dev' });
  });

  it('refuses a file that isn’t a form, before calling the API', async () => {
    const { io, err, fetch } = setup([], { files: { 'bad.json': '{"name":"x"}', 'notjson.txt': 'hello' } });
    expect(await runCli(['form-values', 'bad.json'], io)).toBe(2);
    expect(err[0]).toMatch(/^bad\.json has no fields/);
    expect(await runCli(['form-values', 'notjson.txt'], io)).toBe(2);
    expect(err[1]).toMatch(/^notjson\.txt isn’t JSON/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('needs the key in the environment, never a flag', async () => {
    const { io, err, fetch } = setup([], { env: {} });
    expect(await runCli(['new'], io)).toBe(2);
    expect(err[0]).toMatch(/^Set PROXYMAIL_QA_API_KEY/);
    expect(await runCli(['new', '--api-key', KEY], { ...io, env: { PROXYMAIL_QA_API_KEY: KEY } })).toBe(2);
    expect(err[1]).toMatch(/^Unknown option --api-key\./);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains wrong commands and options, and shows help and the version', async () => {
    const { io, out, err } = setup([]);
    expect(await runCli(['make'], io)).toBe(2);
    expect(err[0]).toMatch(/^Unknown command make\./);
    expect(await runCli(['wait-code'], io)).toBe(2);
    expect(err[1]).toMatch(/^wait-code takes one address\./);
    expect(await runCli(['new', '--days', 'three'], io)).toBe(2);
    expect(err[2]).toMatch(/^--days takes a whole number\./);
    expect(await runCli(['wait-link', 'a@b.c', '--since', 'yesterday'], io)).toBe(2);
    expect(err[3]).toMatch(/^--since takes a date and time/);
    expect(await runCli([], io)).toBe(0);
    expect(out[0]).toMatch(/^proxymail-qa 0\.13\.0: test inboxes/);
    expect(await runCli(['help', 'wait-link'], io)).toBe(0);
    expect(out[1]).toMatch(/--app {16}The link that opens a mobile app/);
    expect(await runCli(['persona', '--help'], io)).toBe(0);
    expect(out[2]).toMatch(/^proxymail-qa persona <address>/);
    expect(await runCli(['--version'], io)).toBe(0);
    expect(out[3]).toBe('0.13.0');
  });
});

describe('parseFlags', () => {
  const spec = { json: 'boolean', country: 'string' } as const;
  it('reads --flag value, --flag=value, --no-flag and --', () => {
    expect(parseFlags(['a', '--country', 'JP', '--json', '--', '--x'], spec)).toEqual({ args: ['a', '--x'], flags: { country: 'JP', json: true } });
    expect(parseFlags(['--country=IN', '--no-json'], spec)).toEqual({ args: [], flags: { country: 'IN', json: false } });
    expect(parseFlags(['-'], spec)).toEqual({ args: ['-'], flags: {} });
  });
  it('refuses unknown options and missing values', () => {
    expect(() => parseFlags(['--country'], spec)).toThrow('--country needs a value.');
    expect(() => parseFlags(['--country', '--json'], spec)).toThrow('--country needs a value.');
    expect(() => parseFlags(['--json=1'], spec)).toThrow('--json takes no value.');
    expect(() => parseFlags(['-x'], spec)).toThrow('Unknown option -x.');
    expect(() => parseFlags(['--no-country'], spec)).toThrow('Unknown option --no-country.');
  });
});
