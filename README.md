# proxymail-qa

Test the emails your app sends, end to end, from Playwright, Cypress,
Puppeteer, Jest, Vitest or any Node script. Create a disposable address, sign
up with it, and get the verification code or link in one call that waits for
it. Then:

- check an email was sent exactly once, or not at all
- check each email: SPF, DKIM and DMARC, links to localhost or the wrong host,
  a stated expiry, plain text, language and phone layout
- sign up with a test persona (name, date of birth, country) and a saved
  password, or an unusual address variant
- borrow a verified test account for sign-in tests and give it back
- wait for a coupon, record whether checkout took it, and catch an offer
  given twice to versions of one address
- test unsubscribing: any marketing email from that sender afterwards fails
- check marketing emails: unsubscribe headers, a spam score and the consent
  rules where the persona lives
- check a welcome series or drip campaign came in order and on time
- find out why an email didn't arrive
- group tests into a run whose report says which test each email came from

Checkout results, offers given twice, unsubscribing, consent, welcome series,
the marketing checks and the spam score are in
[Labs](https://proxymail.qa/docs/labs) for now: the key's creator switches
them on in the app under Account settings → Labs. Until then those methods
throw with a 403 that says so, and `checkEmail` leaves those checks out.

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

In a run (the GitHub Action, or `startRun` in `globalSetup`), the report can say
which test each email came from. Use the `qa` fixture from
`proxymail-qa/playwright`, a client that names its test in every call, and add
the reporter, which records failed and flaky tests and the totals:

```ts
// playwright.config.ts
reporter: [['list'], ['proxymail-qa/playwright/reporter']],

// signup.spec.ts
import { test, expect } from 'proxymail-qa/playwright';

test('sign-up sends one code', async ({ page, qa }) => {
  const { address } = await qa.createAddress();
  // …
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

// Find a test account made earlier: an under-18 in GB with a saved password.
const [teen] = await qa.listAddresses({ tags: ['age-gate'], country: 'GB', maxAge: 17, hasPassword: true });

// Sign in again as a saved test account: the one used on this site first, with
// its password (needs a key with "Can read saved passwords"); null if none fits.
const account = await qa.signInAccount({ site: 'staging.example.com', tags: ['verified'] });

// How many addresses this project can still create: Free has 500 in total
// and 50 a day (limit null on Team). Past the 500, createAddress throws a 402
// plan_required; past the day's 50, a 429 daily_limit until midnight UTC.
const { addresses } = await qa.project();

// Testing on localhost? Links to it then pass checkEmail's local-links check.
await qa.markDevHost('localhost:3000');

// The link that opens a mobile app (myapp://…) when the email also has a web one.
const { value: appLink } = await qa.waitForLink(address, { app: true });

// The email itself, for template tests (the HTML is cleaned when it arrives).
const [latest] = await qa.messages(address, { includeHtml: true, limit: 1 });

// Unusual but valid versions of the address, and invalid ones to reject.
const { delivered, invalid } = await qa.variants(address);

// Awkward names and passwords for the form's other fields, grouped by what
// the app should do with each: accept, reject, store_as_text, decide.
const names = await qa.nameVariants({ field: 'first_name', maxLength: 50 });
const passwords = await qa.passwordVariants({ minLength: 8, maxLength: 64 });

// After the app changes the test account's password, keep the saved one in step.
await qa.setPassword(address, { password: 'the-new-test-password' });

// Check the email that arrived: SPF, DKIM, DMARC, local or http links, where
// its link goes, a stated expiry and more. Verdicts only, never its content.
const result = await qa.checkEmail(address, { type: 'link', expectHost: 'staging.example.com' });
expect(result.failed).toEqual([]);

// A localised email: in German, with the user's name in it.
await qa.checkEmail(address, { expectLanguage: 'de', expectText: ['Hallo Maya'] });

// What to type or pick in each field of a sign-up form, from a new address
// made for it: a username and password that fit the rules, the date of birth
// in the field's format, a country the drop-down offers. You fill it in.
const { values } = await qa.formValues({
  fields: [
    { id: 'email', type: 'email', label: 'Email' },
    { id: 'dob', type: 'text', label: 'Date of birth', placeholder: 'DD/MM/YYYY' },
  ],
});

// The form's own questions too: the project's custom fields come back with
// kind 'custom', and fields nobody taught with kind 'guess' (check those suit
// your test). On a sign-up over several screens, send each screen's fields
// with the same address, and its site and page, so custom fields kept to them
// apply.
const { values: teamStep } = await qa.formValues({
  address,
  site: 'staging.example.com',
  page: '/signup/team',
  fields: [{ id: 'size', type: 'select', label: 'Company size', required: true, options: [{ value: '1-10' }, { value: '11-50' }] }],
});

// In a native app, send the screen's name instead of its page (not both).
await qa.formValues({ address, screen: 'Team details', fields: [{ id: 'role', type: 'text', label: 'Your role' }] });

// formValues is for sign-up forms. A sign-in or password reset form sent with
// the address you signed up with gets only the email or username; without an
// address, the API refuses it (409) and makes no account.

// Teach a field once for the project: everyone's tests and Proxy Mail QA for
// Chrome 0.9.0 and later fill it the same way. Where only leads change custom
// fields, this asks them instead (status 'requested'), unless your key's
// creator leads the project (you_lead): then it's saved straight away.
await qa.saveCustomField({ name: 'Company size', match: { on: 'words', text: 'company size' }, value: { kind: 'option', option: '11-50' } });

// No test value in mind? { kind: 'generate' } makes up one that suits the
// field, the same one for the same account, on any field but a tick box.
await qa.saveCustomField({ name: 'Job title', match: { on: 'words', text: 'job title' }, value: { kind: 'generate' } });

// On a site in several languages, one custom field can hold the label in each.
// Saving replaces the custom field, so send every phrase to keep.
await qa.saveCustomField({
  name: 'Referral code',
  match: { on: 'words', text: 'referral code', also: ['empfehlungscode', 'code de parrainage'] },
  value: { kind: 'leave' },
});

// A sign-up over several screens: each site's sign-up screens, and whether
// Proxy Mail QA for Chrome 0.9.0 and later fills each screen by itself.
// Change them only when the person asks. On a locked project these ask the
// leads instead (status 'requested'), unless your key's creator leads it
// (you_lead): then the change is made straight away.
const { sites } = await qa.sites();
await qa.addSite('staging.example.com', 'staging'); // only a site that doesn't look live
await qa.setCustomFieldEnabled('a-custom-field-id', false);
await qa.setStandardField('company', false); // that box is left empty
await qa.setMultiStep('staging.example.com', true);
const saved = await qa.saveSignupScreen({ site: 'staging.example.com', page: '/signup/team', label: 'Team details' });
await qa.removeSignupScreen(saved.screen.id);

// Borrow an account in the state the test needs. Your hooks make one when
// none is free, confirm its state and put it back; they talk to your app,
// Proxy Mail QA never does.
await qa.withAccount(
  {
    tags: ['verified', 'premium'],
    create: async (account) => signUpAndUpgrade(account.address, account.password),
    check: async (account) => (await getUser(account.address)).plan === 'premium',
    reset: async (account) => resetUser(account.address),
  },
  async (account) => {
    // …the test…
  },
);

// Offers (Labs): wait for the coupon (offers can take minutes), apply it at
// checkout on staging with test payments, then record what the app said.
const coupon = await qa.waitForCode(address, { type: 'coupon', timeout: 600 });
await qa.recordCouponResult(address, 'accepted', { code: coupon.value });

// Unsubscribing (Labs): after the test unsubscribes in the app (Proxy Mail
// QA never opens the link), marketing from that sender fails; receipts can
// still come.
await qa.markUnsubscribed(address);
await qa.expectNoEmail(address, { category: 'marketing', since: new Date(), timeout: 300 });
const { passed } = await qa.checkUnsubscribe(address);

// A run: this client's calls add what they saw, for a report on the pull
// request. In GitHub Actions, the Proxy Mail QA action does this for you and
// the client picks the run up from PROXYMAIL_QA_RUN.
await qa.startRun({ name: 'Sign-up tests' });
// …the tests…
await qa.finishRun({ failed: testsFailed });
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
