# proxymail-qa

Disposable test inboxes for Playwright, Cypress and scripts. Create an address,
sign up with it in the app you're testing, and get the verification code or
link from the email in one call that waits for it.

Get an API key in [app.proxymail.qa](https://app.proxymail.qa) → Project
settings → API keys (the Free plan includes it), and set it as
`PROXYMAIL_QA_API_KEY`. Full guide: https://proxymail.qa/docs/api

```ts
import { ProxyMailQA } from 'proxymail-qa';

const qa = new ProxyMailQA(); // reads PROXYMAIL_QA_API_KEY
const { address, persona, password } = await qa.createAddress({ persona: true, password: true, label: 'Sign-up test' });
// ...sign up with the address, persona and password...
const { value: code } = await qa.waitForCode(address); // waits up to 30 s
const { value: link } = await qa.waitForLink(address, { type: 'reset', timeout: 60 });
await qa.deleteAddress(address);
```

With `password: true` the result's `password` is typed as a `string` (pass the
options inline, or `as const`, so TypeScript sees `true`).

Waits return the code or link on its own, with the sending service and its
expiry, never the email's text. They throw `ProxyMailQAError` (status 404) when
nothing arrives in time.

## Playwright

```ts
import { test as base, expect } from '@playwright/test';
import { ProxyMailQA } from 'proxymail-qa';

const test = base.extend<{ inbox: { address: string } }>({
  inbox: async ({}, use) => {
    const qa = new ProxyMailQA();
    const created = await qa.createAddress({ persona: true });
    await use(created);
    await qa.deleteAddress(created.address);
  },
});

test('sign-up sends a working code', async ({ page, inbox }) => {
  const submitted = new Date();
  await page.goto('/signup');
  await page.getByLabel('Email').fill(inbox.address);
  await page.getByRole('button', { name: 'Sign up' }).click();
  const { value } = await new ProxyMailQA().waitForCode(inbox.address, { since: submitted });
  await page.getByLabel('Code').fill(value);
  await expect(page).toHaveURL(/welcome/);
});
```

## Cypress

Register tasks in `cypress.config.ts`, since Cypress runs them in Node:

```ts
import { ProxyMailQA } from 'proxymail-qa';

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      const qa = new ProxyMailQA();
      on('task', {
        createAddress: () => qa.createAddress({ persona: true }),
        waitForLink: (address: string) => qa.waitForLink(address, { type: 'verify' }),
      });
    },
  },
});
```

```js
cy.task('createAddress').then(({ address }) => {
  cy.get('[name=email]').type(address);
  cy.contains('Sign up').click();
  cy.task('waitForLink', address, { timeout: 35000 }).then(({ value }) => cy.visit(value));
});
```

## More

```ts
// A persona with a date of birth for an age band, and a country.
await qa.createAddress({ persona: true, age: 'under13', country: 'GB' });

// The link that opens a mobile app (myapp://…) when the email also has a web one.
const { value: appLink } = await qa.waitForLink(address, { app: true });

// The email itself, for template tests (the HTML is cleaned when it arrives).
const [latest] = await qa.messages(address, { includeHtml: true, limit: 1 });

// Unusual but valid versions of the address, and invalid ones to reject.
const { delivered, invalid } = await qa.variants(address);

// After the app changes the test account's password, keep the saved one in step.
await qa.setPassword(address, { password: 'the-new-test-password' });
```

When a wait comes back empty, the error says why as far as Proxy Mail QA can
tell, for example that the app's email provider only sends to verified
addresses (sandbox mode): read `error.hint`, or call `qa.checkDelivery(address)`
at any time. Retrying won't help until the app can email any address.

Mobile apps (XCUITest, Espresso, Maestro, Flutter, Detox and Appium):
https://proxymail.qa/docs/mobile

## Source

https://github.com/aaquib90/proxymail-qa-js. Releases are published to npm from
GitHub Actions with provenance, so npm shows which commit and workflow built
each version.

## License

MIT
