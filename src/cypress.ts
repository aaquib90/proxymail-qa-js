// Cypress commands (FM-15), matching the Playwright helper: cy.proxymail has
// the client's methods, for the test it's in. Import it in the support file
// and register the task with setupProxyMailQA from proxymail-qa/cypress/plugin.
//
//   // cypress/support/e2e.ts
//   import 'proxymail-qa/cypress';
//
//   it('signs up', () => {
//     cy.proxymail.createAddress({ persona: true }).then(({ address }) => {
//       …
//       cy.proxymail.waitForCode(address).then(({ value }) => cy.get('[name=code]').type(value));
//     });
//   });
//
// Each command runs in Node through cy.task, so the API key never reaches the
// browser. In a run, each call says which test it came from.
import { CYPRESS_METHODS, CYPRESS_TASK, type CypressMethod, type CypressTaskCall } from './cypress-methods.js';
import type { ProxyMailQA } from './index.js';
import { testName } from './test-name.js';

export type ProxyMailCommands = {
  [K in CypressMethod]: (...args: Parameters<ProxyMailQA[K]>) => Cypress.Chainable<Awaited<ReturnType<ProxyMailQA[K]>>>;
};

declare global {
  // Merges with Cypress's own types when they're installed.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Chainable<Subject = any> {
      proxymail: ProxyMailCommands;
    }
  }
}

// The parts of Cypress's globals this uses.
interface CypressGlobal {
  currentTest?: { title?: string; titlePath?: string[] } | null;
  log: (options: { name: string; displayName?: string; message: string }) => unknown;
}
interface CyGlobal {
  task: (name: string, arg: CypressTaskCall, options: { log: boolean; timeout?: number }) => unknown;
}

const WAITS = new Set<string>(['waitForCode', 'waitForLink', 'expectNoEmail']);
const DEFAULT_WAIT = 30;

// Cypress gives up on a task after 60 seconds; a wait can hold for its
// timeout, so give it that and a margin.
export function taskTimeout(method: string, args: unknown[]) {
  if (!WAITS.has(method)) return undefined;
  const options = args[1] as { timeout?: number } | undefined;
  return ((options?.timeout ?? DEFAULT_WAIT) + 30) * 1000;
}

// Builds cy.proxymail from Cypress's globals; exported for the tests.
export function proxymailCommands(Cypress: CypressGlobal, cy: CyGlobal) {
  const call = (method: string, args: unknown[]) => {
    const test = Cypress.currentTest;
    const name = test ? testName('', test.titlePath ?? (test.title ? [test.title] : [])) : '';
    Cypress.log({ name: 'proxymail', displayName: 'proxymail', message: [method, typeof args[0] === 'string' ? args[0] : ''].filter(Boolean).join(' ') });
    return cy.task(CYPRESS_TASK, { method, args, test: name || null }, { log: false, timeout: taskTimeout(method, args) });
  };
  return Object.fromEntries(CYPRESS_METHODS.map((method) => [method, (...args: unknown[]) => call(method, args)])) as unknown as ProxyMailCommands;
}

const globals = globalThis as unknown as { Cypress?: CypressGlobal; cy?: CyGlobal };
if (globals.Cypress && globals.cy) {
  Object.defineProperty(globals.cy, 'proxymail', { value: proxymailCommands(globals.Cypress, globals.cy), configurable: true });
}
