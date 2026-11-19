// Cypress's Node side (FM-15): registers the task cy.proxymail calls, so the
// API key stays in Node and never reaches the browser.
//
//   // cypress.config.ts
//   import { setupProxyMailQA } from 'proxymail-qa/cypress/plugin';
//   export default defineConfig({ e2e: { setupNodeEvents(on) { setupProxyMailQA(on); } } });
//
// With PROXYMAIL_QA_RUN set (the GitHub Action sets it), each call says which
// test it came from, so the run's report shows it.
import { CYPRESS_METHODS, CYPRESS_TASK, type CypressTaskCall } from './cypress-methods.js';
import { ProxyMailQA, type ClientOptions } from './index.js';

// Cypress's on, as far as this needs it.
export type CypressOn = (event: 'task', tasks: Record<string, (arg: CypressTaskCall) => unknown>) => void;

const ALLOWED = new Set<string>(CYPRESS_METHODS);

export function setupProxyMailQA(on: CypressOn, options: ClientOptions = {}) {
  // Made at the first call, so a missing key fails the test that needs it
  // with the client's own message, not Cypress's start.
  let base: ProxyMailQA | undefined;
  on('task', {
    [CYPRESS_TASK]: async ({ method, args, test }: CypressTaskCall) => {
      if (!ALLOWED.has(method)) throw new Error(`cy.proxymail has no ${method}.`);
      base ??= new ProxyMailQA(options);
      const qa = test ? base.forTest(test) : base;
      const result = await (qa[method as keyof ProxyMailQA] as (...a: unknown[]) => unknown).apply(qa, args);
      // A Cypress task can't return undefined.
      return result === undefined ? null : result;
    },
  });
}
