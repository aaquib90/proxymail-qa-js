import { afterEach, describe, expect, it, vi } from 'vitest';
import ProxyMailQAReporter from '../src/playwright-reporter.ts';
import { ProxyMailQA } from '../src/index.ts';

const RUN = '00000000-0000-4000-8000-000000000321';
type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';
const testCase = (title: string, outcome: Outcome, error?: string) => ({
  titlePath: () => ['', 'chromium', 'signup.spec.ts', 'sign-up', title],
  outcome: () => outcome,
  results: [{ duration: 1234, error: error ? { message: error } : undefined }],
});
const suite = (...tests: ReturnType<typeof testCase>[]) => ({ allTests: () => tests });

function stubFetch() {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the Playwright reporter', () => {
  it('records failed and flaky tests, then the totals', async () => {
    vi.stubEnv('PROXYMAIL_QA_RUN', RUN);
    const fetch = stubFetch();
    const reporter = new ProxyMailQAReporter({ apiKey: 'qa_test', baseUrl: 'https://api.test' });
    reporter.onBegin(
      {},
      suite(
        testCase('gets a code', 'expected'),
        testCase('one email', 'unexpected', 'expected 1, got 2'),
        testCase('invite', 'flaky'),
        testCase('later', 'skipped'),
      ) as never,
    );
    await reporter.onEnd({ status: 'failed' } as never);
    const sent = fetch.mock.calls.map(([url, init]) => [url, JSON.parse(String(init!.body))]);
    expect(sent).toEqual([
      [`https://api.test/v1/runs/${RUN}/tests`, { name: 'chromium › sign-up › one email', status: 'failed', duration_ms: 1234, error: 'expected 1, got 2' }],
      [`https://api.test/v1/runs/${RUN}/tests`, { name: 'chromium › sign-up › invite', status: 'flaky', duration_ms: 1234 }],
      [`https://api.test/v1/runs/${RUN}/tests`, { totals: { passed: 1, failed: 1, skipped: 1, flaky: 1 } }],
    ]);
  });

  it('does nothing outside a run, or without a key', async () => {
    vi.stubEnv('PROXYMAIL_QA_RUN', '');
    const fetch = stubFetch();
    const reporter = new ProxyMailQAReporter({ apiKey: 'qa_test' });
    reporter.onBegin({}, suite(testCase('one email', 'unexpected', 'boom')) as never);
    await reporter.onEnd({ status: 'failed' } as never);
    vi.stubEnv('PROXYMAIL_QA_RUN', RUN);
    vi.stubEnv('PROXYMAIL_QA_API_KEY', '');
    await new ProxyMailQAReporter().onEnd({ status: 'failed' } as never);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('a client for one test', () => {
  it('names the test in each call, percent-encoded, only in a run', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ address: 'a@mailclub.dev' }, { status: 201 }));
    const qa = new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test', fetch: fetch as never, run: RUN });
    await qa.forTest('sign-up › sends one code').createAddress();
    expect((fetch.mock.calls[0]![1]!.headers as Record<string, string>)['Proxy-Mail-QA-Test']).toBe('sign-up%20%E2%80%BA%20sends%20one%20code');
    await new ProxyMailQA({ apiKey: 'qa_test', baseUrl: 'https://api.test', fetch: fetch as never, run: null }).forTest('x').createAddress();
    expect((fetch.mock.calls[1]![1]!.headers as Record<string, string>)['Proxy-Mail-QA-Test']).toBeUndefined();
  });
});
