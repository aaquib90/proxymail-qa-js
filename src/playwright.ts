// Playwright tests with Proxy Mail QA. The qa fixture is a client for the
// test it's in: in a run (PROXYMAIL_QA_RUN, set by the GitHub Action or by
// startRun in globalSetup), each call says which test it belongs to, so the
// run's report shows which test each email came from.
//
//   import { test, expect } from 'proxymail-qa/playwright';
//
//   test('sign-up sends one code', async ({ page, qa }) => {
//     const { address } = await qa.createAddress();
//     …
//   });
//
// Add proxymail-qa/playwright/reporter to the config's reporters to record
// failed tests and the totals in the run too.
import { test as base } from '@playwright/test';
import { ProxyMailQA } from './index.js';
import { testName } from './test-name.js';

export const test = base.extend<{ qa: ProxyMailQA }>({
  // eslint-disable-next-line no-empty-pattern
  qa: async ({}, use, testInfo) => {
    // titlePath starts with the file.
    await use(new ProxyMailQA().forTest(testName(testInfo.project.name, testInfo.titlePath.slice(1))));
  },
});

export { expect } from '@playwright/test';
