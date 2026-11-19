import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CYPRESS_METHODS, CYPRESS_TASK, NOT_IN_CYPRESS, type CypressTaskCall } from '../src/cypress-methods.ts';
import { setupProxyMailQA } from '../src/cypress-plugin.ts';
import { proxymailCommands, taskTimeout, type ProxyMailCommands } from '../src/cypress.ts';
import { ProxyMailQA, type CreatedAddress, type Match } from '../src/index.ts';

// The class's public methods, read from its source: every one is in
// cy.proxymail or left out on purpose.
function publicMethods() {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export class ProxyMailQA {'), source.indexOf('\nconst message ='));
  // A Set: overloads repeat the name.
  const names = new Set([...body.matchAll(/^ {2}(?:async )?([a-zA-Z]+)(?:<[^>]+>)?\(/gm)].map((m) => m[1]!));
  names.delete('constructor');
  return [...names];
}

describe('cy.proxymail', () => {
  it('has every public client method, or leaves it out on purpose', () => {
    const methods = publicMethods();
    expect(methods.length).toBeGreaterThan(50);
    expect([...CYPRESS_METHODS, ...NOT_IN_CYPRESS].sort()).toEqual([...methods].sort());
    for (const method of CYPRESS_METHODS) expect(typeof ProxyMailQA.prototype[method]).toBe('function');
  });

  it('sends each call to the Node task with the test’s name, and logs it without the key', () => {
    const task = vi.fn((_name: string, _arg: CypressTaskCall, _options: { log: boolean; timeout?: number }) => 'chain');
    const log = vi.fn();
    const Cypress = { currentTest: { title: 'signs up', titlePath: ['Sign-up', 'signs up'] }, log };
    const commands = proxymailCommands(Cypress, { task });
    expect(commands.createAddress({ persona: true, country: 'PK' })).toBe('chain');
    expect(task).toHaveBeenCalledWith(
      CYPRESS_TASK,
      { method: 'createAddress', args: [{ persona: true, country: 'PK' }], test: 'Sign-up › signs up' },
      { log: false, timeout: undefined },
    );
    commands.waitForCode('a@mailclub.dev', { timeout: 90 });
    expect(task.mock.calls[1]![2]).toEqual({ log: false, timeout: 120_000 });
    expect(log.mock.calls.map(([o]) => o.message)).toEqual(['createAddress', 'waitForCode a@mailclub.dev']);
    Cypress.currentTest = null as never;
    commands.deleteAddress('a@mailclub.dev');
    expect(task.mock.calls[2]![1].test).toBeNull();
  });

  it('gives waits their timeout and a margin, beyond Cypress’s 60 seconds', () => {
    expect(taskTimeout('waitForLink', ['a@b.c'])).toBe(60_000);
    expect(taskTimeout('expectNoEmail', ['a@b.c', { timeout: 45 }])).toBe(75_000);
    expect(taskTimeout('createAddress', [{}])).toBeUndefined();
  });

  it('adds cy.proxymail when imported in a Cypress support file', async () => {
    const task = vi.fn((_name: string, _arg: CypressTaskCall, _options: { log: boolean; timeout?: number }) => 'chain');
    const cy: { task: typeof task; proxymail?: ProxyMailCommands } = { task };
    const globals = globalThis as unknown as { Cypress?: unknown; cy?: unknown };
    globals.Cypress = { currentTest: { title: 'signs up' }, log: vi.fn() };
    globals.cy = cy;
    try {
      vi.resetModules();
      await import('../src/cypress.ts');
      expect(cy.proxymail).toBeDefined();
      cy.proxymail!.waitForLink('a@mailclub.dev');
      expect(task).toHaveBeenCalledWith(CYPRESS_TASK, { method: 'waitForLink', args: ['a@mailclub.dev'], test: 'signs up' }, { log: false, timeout: 60_000 });
    } finally {
      delete globals.Cypress;
      delete globals.cy;
    }
  });

  it('is typed like the client, as Cypress chains', () => {
    type Chain<T> = Cypress.Chainable<T>;
    expectTypeOf<ProxyMailCommands['createAddress']>().returns.toEqualTypeOf<Chain<CreatedAddress>>();
    expectTypeOf<ProxyMailCommands['waitForCode']>().returns.toEqualTypeOf<Chain<Match>>();
    expectTypeOf<ProxyMailCommands['waitForCode']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<Chain<unknown>['proxymail']>().toEqualTypeOf<ProxyMailCommands>();
  });
});

describe('setupProxyMailQA', () => {
  function register() {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ address: 'a@mailclub.dev' }));
    let handler: ((arg: CypressTaskCall) => unknown) | undefined;
    setupProxyMailQA(
      (_event, tasks) => {
        handler = tasks[CYPRESS_TASK];
      },
      { apiKey: 'qa_test', baseUrl: 'https://api.test', run: 'run-1', fetch: fetch as unknown as typeof globalThis.fetch },
    );
    return { fetch, handler: handler! };
  }

  it('runs the method in Node for the named test', async () => {
    const { fetch, handler } = register();
    expect(await handler({ method: 'createAddress', args: [{ persona: true }], test: 'Sign-up › signs up' })).toEqual({ address: 'a@mailclub.dev' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/addresses');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer qa_test',
      'Proxy-Mail-QA-Run': 'run-1',
      'Proxy-Mail-QA-Test': encodeURIComponent('Sign-up › signs up'),
    });
  });

  it('returns null rather than undefined, and refuses methods cy.proxymail hasn’t', async () => {
    const { fetch, handler } = register();
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await handler({ method: 'deleteAddress', args: ['a@mailclub.dev'] })).toBeNull();
    await expect(handler({ method: 'withAccount', args: [] })).rejects.toThrow('cy.proxymail has no withAccount.');
    await expect(handler({ method: 'request', args: ['GET', '/addresses'] })).rejects.toThrow('cy.proxymail has no request.');
  });
});
