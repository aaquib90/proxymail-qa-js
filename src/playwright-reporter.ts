// A Playwright reporter that adds the tests' results to the run (AC-11):
// each failed or flaky test, with the start of its error, then the totals.
// With the qa fixture (proxymail-qa/playwright), the run's report then shows
// which test failed and what its emails did. Does nothing outside a run.
//
//   // playwright.config.ts
//   reporter: [['list'], ['proxymail-qa/playwright/reporter']],
import type { FullResult, Reporter, Suite, TestCase, TestStep } from '@playwright/test/reporter';
import { ProxyMailQA, type ClientOptions, type TestResultInput } from './index.js';
import { testName } from './test-name.js';

// Enough for a report; the rest are in Playwright's own.
const MAX_RESULTS = 200;

export default class ProxyMailQAReporter implements Reporter {
  private suite: Suite | null = null;

  constructor(private readonly options: Pick<ClientOptions, 'apiKey' | 'baseUrl'> = {}) {}

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }

  async onEnd(_result: FullResult) {
    const qa = this.client();
    if (!qa || !this.suite) return;
    const totals = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
    const results: TestResultInput[] = [];
    for (const test of this.suite.allTests()) {
      const outcome = test.outcome();
      if (outcome === 'expected') totals.passed++;
      else if (outcome === 'skipped') totals.skipped++;
      else {
        const flaky = outcome === 'flaky';
        if (flaky) totals.flaky++;
        else totals.failed++;
        const last = test.results.at(-1);
        results.push({
          name: nameOf(test),
          status: flaky ? 'flaky' : 'failed',
          durationMs: last?.duration,
          error: flaky ? undefined : withStep(failedStep(last?.steps ?? []), last?.error?.message),
        });
      }
    }
    // Failures never fail the test run itself: the report is evidence.
    for (const result of results.slice(0, MAX_RESULTS)) await qa.recordTest(result).catch(() => {});
    await qa.recordTestTotals(totals).catch(() => {});
  }

  printsToStdio() {
    return false;
  }

  private client(): ProxyMailQA | null {
    try {
      const qa = new ProxyMailQA(this.options);
      return qa.run ? qa : null;
    } catch {
      // No API key: nothing to report to.
      return null;
    }
  }
}

// titlePath: the root, the project, the file, then describe blocks and the title.
function nameOf(test: TestCase): string {
  const [, project = '', , ...path] = test.titlePath();
  return testName(project, path);
}

// The innermost step that failed: a test.step of the test's own, or the
// browser action or assertion inside it, such as a click or an expect.
function failedStep(steps: readonly TestStep[]): TestStep | null {
  for (const step of steps) {
    if (!step.error) continue;
    return failedStep(step.steps) ?? step;
  }
  return null;
}

// "At “Fill in the code” › locator.fill(…): Error: …", so the report says
// which browser step failed as well as why.
function withStep(step: TestStep | null, message: string | undefined): string | undefined {
  if (!step) return message;
  const path = step.titlePath().filter(Boolean).slice(-2).join(' › ');
  return `At “${path}”: ${message ?? 'failed'}`;
}
