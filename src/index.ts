// A small client for the Proxy Mail QA REST API (https://proxymail.qa/docs/api):
// create disposable test inboxes and wait for the verification code or link
// from the email the app under test sends. No dependencies; works in Node 18+,
// Playwright, Cypress tasks and other runtimes with fetch.

export interface ClientOptions {
  // Defaults to the PROXYMAIL_QA_API_KEY environment variable.
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  // A run to add this client's calls to (startRun). Defaults to the
  // PROXYMAIL_QA_RUN environment variable, which the GitHub Action sets.
  run?: string | null;
}

export interface Persona {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  // YYYY-MM-DD, only when the address has one.
  date_of_birth?: string;
  // ISO 3166-1 alpha-2, such as GB, only when the address has one.
  country?: string;
}

export type AgeBand = 'adult' | 'over21' | 'under18' | 'under15' | 'under13' | 'any' | 'turns18tomorrow' | 'turned18today';

export interface Address {
  address: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  persona: Persona | null;
  notes: string | null;
  tags: string[];
  has_password: boolean;
  email_count: number;
  latest: Omit<Match, 'address' | 'email_id' | 'service_domain'> | null;
  // Only while someone has it checked out of the pool.
  checked_out_until?: string;
}

// The account pool: filters like listAddresses, and how long to hold it.
export interface CheckoutOptions extends Omit<ListAddressesOptions, 'limit' | 'before'> {
  // 1 to 60; 10 when left out.
  minutes?: number;
}

// An account checked out of the pool: nobody else gets it until it's
// returned or checkout.until passes.
export interface CheckedOutAccount extends Address {
  checkout: { token: string; until: string };
}

// A sign-up form's field, as the page describes it (formValues).
export interface FormFieldInput {
  // Your name for the field (a selector, a ref): it comes back with its value.
  id?: string;
  // The input's type (text, email, password, date…), or select for a drop-down.
  type?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  autocomplete?: string;
  // What the group around it says, such as a fieldset's legend.
  group?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  options?: Array<{ value: string; label?: string }>;
}

export interface FormValuesOptions extends Omit<CreateAddressInput, 'password' | 'persona' | 'name'> {
  fields: FormFieldInput[];
  // Use this address, made earlier, instead of making a new one.
  address?: string;
}

export interface FormValue {
  id: string;
  kind:
    | 'email'
    | 'confirm_email'
    | 'first_name'
    | 'last_name'
    | 'full_name'
    | 'username'
    | 'password'
    | 'confirm_password'
    | 'date_of_birth'
    | 'birth_day'
    | 'birth_month'
    | 'birth_year'
    | 'country'
    | 'other';
  // What to type, or the option's value to pick. Null to leave it to you.
  value: string | null;
  note?: string;
}

export interface FormValues {
  address: string;
  created: boolean;
  persona: Persona | null;
  // A new address's password, saved on it: shown only here.
  password?: string;
  values: FormValue[];
}

// withAccount's options: the pool's filters, plus hooks your test code runs
// to make, check and restore accounts in your app. Proxy Mail QA never signs
// in to your app; the hooks do, with your own app access.
export interface PreparedAccountOptions extends CheckoutOptions {
  // Makes a new account when none is free: sign up in your app with the new
  // address and its password, verify it and put it in the state the tags
  // describe. It's held for this test while the hook runs, and gets the tags
  // once the hook (and check) succeed.
  create?: (account: CheckedOutAccount & { password: string }) => Promise<void>;
  // For new accounts: label, age or date of birth, country, domain. The
  // password is always generated, and country defaults to the filter's.
  newAccount?: Omit<CreateAddressInput, 'password'>;
  // Confirms the account is in the state the test needs (verified, on the
  // premium plan, no orders…). Return false or throw when it isn't: it's
  // reset (with reset) and checked again, and otherwise another account is
  // tried. An account that still fails loses the filter's tags and is tagged
  // check-failed.
  check?: (account: CheckedOutAccount) => Promise<boolean | void>;
  // Restores the account's state after the test, before it goes back to the
  // pool. If it fails, the account loses the filter's tags and is tagged
  // needs-reset, so no test gets it in an unknown state.
  reset?: (account: CheckedOutAccount) => Promise<void>;
  // How many pool accounts to check before making a new one or giving up: 3.
  attempts?: number;
}

// The state a test left the account in, recorded when it's returned.
export interface ReturnState {
  addTags?: string[];
  removeTags?: string[];
}

// createAddress({ password: true }) returns the password this once.
export interface CreatedAddress extends Address {
  password?: string;
}

// What createAddress returns when asked for a password: it's always there.
export interface CreatedAddressWithPassword extends CreatedAddress {
  password: string;
}

// setPassword's answer; password is there only when one was generated.
export interface SavedPassword {
  address: string;
  label: string;
  saved: boolean;
  password?: string;
}

// A code or link, and nothing else from the email.
export interface Match {
  address: string;
  type: 'code' | 'link';
  subtype: string;
  value: string;
  service: string | null;
  service_domain: string | null;
  received_at: string;
  expires_at: string | null;
  email_id: string;
}

export interface CreateAddressInput {
  label?: string;
  // A custom name before the @; random when left out.
  name?: string;
  // Also generate a fictional first name, last name and username.
  persona?: boolean;
  // Also generate a strong password for the sign-up form, saved on the
  // address. It's returned once, by createAddress.
  password?: boolean;
  lifetimeDays?: number;
  domain?: string;
  // A date of birth for the persona: generated for an age band, or given as
  // YYYY-MM-DD. Not both.
  age?: AgeBand;
  dateOfBirth?: string;
  // Where the persona lives, as an ISO 3166-1 alpha-2 code such as GB.
  country?: string;
}

export interface ListAddressesOptions {
  // 1 to 200; 50 when left out.
  limit?: number;
  // Addresses created before this time (ISO 8601), for paging.
  before?: string;
  // Addresses with every one of these tags.
  tags?: string[];
  // The persona's country, an ISO 3166-1 alpha-2 code such as GB.
  country?: string;
  // Age today in whole years, from the persona's date of birth: maxAge 17
  // finds under-18s. Addresses without a date of birth don't match.
  minAge?: number;
  maxAge?: number;
  // Whether a password is saved on the address.
  hasPassword?: boolean;
  // Part of the address, label, notes, name or username.
  search?: string;
}

export interface AddressPatch {
  label?: string | null;
  notes?: string | null;
  tags?: string[];
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  // YYYY-MM-DD; null clears it.
  date_of_birth?: string | null;
  // ISO 3166-1 alpha-2; null clears it.
  country?: string | null;
}

export interface Refusal {
  reason: 'too_large' | 'address_limit' | 'daily_limit';
  first_at: string;
  last_at: string;
  count: number;
  size_bytes: number | null;
}

// What reached an address, what was refused and why, without waiting.
export interface DeliveryStatus {
  address: string;
  created_at: string;
  expires_at: string;
  receiving: boolean;
  emails: number;
  last_email_at: string | null;
  refused: Refusal[];
  hint: string;
  help: string;
}

export interface Variant {
  // What the variant checks, e.g. "An apostrophe".
  tests: string;
  address: string;
}

// Unusual versions of an address, for testing that sign-up forms accept valid
// addresses and reject invalid ones. Mail to "delivered" ones arrives in the
// address's inbox.
export interface Variants {
  address: string;
  delivered: Variant[];
  undeliverable: Variant[];
  invalid: Variant[];
}

export interface WaitOptions {
  // Seconds to wait in total (default 30). Longer waits repeat the request.
  timeout?: number;
  // Only match email from this service, by name or domain.
  service?: string;
  // Only match email received at or after this time (Date or ISO string).
  // Default: the last 15 minutes.
  since?: Date | string;
  // Only a code or link nobody has used yet: not returned by an earlier
  // wait, nor opened or copied in the app.
  unused?: boolean;
}

export type LinkType = 'verify' | 'magic_signin' | 'invite' | 'reset' | 'any';

// An email without its content: when it came, who sent it and what its main
// code or link was for.
export interface EmailSummary {
  received_at: string;
  service: string | null;
  service_domain: string | null;
  type: 'code' | 'link' | null;
  subtype: string | null;
  email_id: string;
}

export interface EmailCount {
  address: string;
  since: string | null;
  count: number;
  // The first 50, oldest first.
  emails: EmailSummary[];
}

export interface CountOptions {
  // Only email received at or after this time (Date or ISO string).
  since?: Date | string;
  // Only email from this service, by name or domain.
  service?: string;
  // Only emails with a code (not coupons, unless subtype says) or with a link
  // (verify, magic sign-in, invite or reset, unless subtype says).
  type?: 'code' | 'link';
  subtype?: CountSubtype | CountSubtype[];
}

export type CountSubtype = 'otp' | 'coupon' | 'verify' | 'magic_signin' | 'invite' | 'reset' | 'other' | 'any';

// Checks on one received email (checkEmail): pass, fail, warn or skip, each
// with a one-line reason. Never the email's text or its links.
export type CheckId =
  | 'spf'
  | 'dkim'
  | 'dmarc'
  | 'local_links'
  | 'plain_http'
  | 'expected_host'
  | 'expiry'
  | 'plain_text'
  | 'size'
  | 'images_only'
  | 'expected_text'
  | 'language';

export interface EmailCheck {
  check: CheckId;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  detail: string;
}

export interface EmailChecks {
  address: string;
  email: { id: string; received_at: string; service: string | null; service_domain: string | null; type: 'code' | 'link' | null; subtype: string | null };
  // No check failed (warnings don't count).
  passed: boolean;
  failed: CheckId[];
  warnings: CheckId[];
  checks: EmailCheck[];
}

export interface CheckOptions extends CountOptions {
  // The email to check, as countEmails gives it. Default: the newest that matches.
  emailId?: string;
  // The site its sign-in, verify, reset or invite link should go to, after
  // any redirect, e.g. staging.example.com. Without it, that check is skipped.
  expectHost?: string;
  // Phrases the subject or body should contain (up to 10), such as the
  // user's first name. Case, curly quotes and spacing don't matter.
  expectText?: string[];
  // The language it should be in, such as de or pt-BR.
  expectLanguage?: string;
}

// expectNoEmail's answer: nothing matching arrived between since and until.
export interface NoEmail {
  address: string;
  since: string;
  until: string;
}

// A CI job or agent session as one run, with the evidence of what its calls
// saw (startRun).
export interface RunInput {
  name?: string;
  source?: 'ci' | 'agent' | 'api';
  meta?: {
    repository?: string;
    branch?: string;
    commit?: string;
    pull_request?: number;
    workflow?: string;
    job_url?: string;
    agent?: string;
  };
}

export interface RunEvent {
  at: string;
  kind: 'address' | 'email' | 'missing' | 'none' | 'count' | 'checks' | 'note';
  address: string | null;
  failed: boolean;
  detail: Record<string, unknown>;
}

export interface Run {
  id: string;
  name: string;
  source: 'ci' | 'agent' | 'api';
  status: 'running' | 'passed' | 'failed';
  meta: NonNullable<RunInput['meta']>;
  started_at: string;
  finished_at: string | null;
  // The run in the app.
  url: string;
  // Not in listRuns.
  events?: RunEvent[];
}

// An API error. When a wait finds nothing, hint says why as far as Proxy Mail
// QA can tell (an email provider in sandbox mode, say) and refused lists any
// mail it turned away; both are in the message too.
export class ProxyMailQAError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly refused?: Refusal[],
    readonly help?: string,
  ) {
    super(hint ? `${message} ${hint}` : message);
    this.name = 'ProxyMailQAError';
  }
}

const TIMED_OUT = /^No (code|link) arrived/;

function countQuery(options: CountOptions, extra: Record<string, string> = {}) {
  const query = new URLSearchParams(extra);
  if (options.since !== undefined) query.set('since', new Date(options.since).toISOString());
  if (options.service) query.set('service', options.service);
  if (options.type) query.set('type', options.type);
  const subtype = [options.subtype ?? []].flat().join(',');
  if (subtype) query.set('subtype', subtype);
  return query.size ? `?${query}` : '';
}

const MAX_WAIT_SECONDS = 30;

export class ProxyMailQA {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  // The run this client's calls add to, if any.
  run: string | null;

  constructor(options: ClientOptions = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const apiKey = options.apiKey ?? env?.PROXYMAIL_QA_API_KEY;
    if (!apiKey) throw new Error('Pass apiKey or set PROXYMAIL_QA_API_KEY. Create a key in Project settings → API keys.');
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.proxymail.qa').replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.run = options.run === undefined ? env?.PROXYMAIL_QA_RUN?.trim() || null : options.run;
  }

  // retry: this call is asked again if nothing arrives, so the run only
  // records the last try's "nothing arrived".
  private async request<T>(method: string, path: string, body?: unknown, retry = false): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.run ? { 'Proxy-Mail-QA-Run': this.run, ...(retry ? { 'Proxy-Mail-QA-Run-Retry': 'true' } : {}) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    if ((response.headers.get('Content-Type') ?? '').startsWith('text/markdown') && response.ok) return (await response.text()) as T;
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; hint?: string; refused?: Refusal[]; help?: string };
    if (!response.ok) {
      throw new ProxyMailQAError(response.status, payload.error ?? 'error', payload.message ?? `Request failed with ${response.status}`, payload.hint, payload.refused, payload.help);
    }
    return payload as T;
  }

  project() {
    return this.request<Record<string, unknown>>('GET', '/project');
  }

  createAddress(input: CreateAddressInput & { password: true }): Promise<CreatedAddressWithPassword>;
  createAddress(input?: CreateAddressInput): Promise<CreatedAddress>;
  createAddress(input: CreateAddressInput = {}): Promise<CreatedAddress> {
    return this.request<CreatedAddress>('POST', '/addresses', {
      label: input.label,
      name: input.name,
      persona: input.persona,
      password: input.password,
      lifetime_days: input.lifetimeDays,
      domain: input.domain,
      age: input.age,
      date_of_birth: input.dateOfBirth,
      country: input.country,
    });
  }

  // What to type or pick in each field of a sign-up form, from a new address
  // made for it (a date of birth if it asks, a country it offers, a password
  // that fits its rules) or one made earlier (address). You fill it in.
  formValues(options: FormValuesOptions) {
    return this.request<FormValues>('POST', '/form-values', {
      fields: options.fields.map((f) => ({
        id: f.id,
        type: f.type,
        name: f.name,
        label: f.label,
        placeholder: f.placeholder,
        autocomplete: f.autocomplete,
        group: f.group,
        pattern: f.pattern,
        min_length: f.minLength,
        max_length: f.maxLength,
        options: f.options,
      })),
      address: options.address,
      label: options.label,
      lifetime_days: options.lifetimeDays,
      domain: options.domain,
      age: options.age,
      date_of_birth: options.dateOfBirth,
      country: options.country,
    });
  }

  // Newest first. With filters, finds test accounts made earlier, such as
  // an under-18 in GB with a saved password: every filter given must match.
  listAddresses(options: ListAddressesOptions = {}) {
    const query = new URLSearchParams();
    if (options.limit) query.set('limit', String(options.limit));
    if (options.before) query.set('before', options.before);
    for (const tag of options.tags ?? []) query.append('tag', tag);
    if (options.country) query.set('country', options.country);
    if (options.minAge !== undefined) query.set('min_age', String(options.minAge));
    if (options.maxAge !== undefined) query.set('max_age', String(options.maxAge));
    if (options.hasPassword !== undefined) query.set('has_password', String(options.hasPassword));
    if (options.search) query.set('search', options.search);
    return this.request<Address[]>('GET', `/addresses${query.size ? `?${query}` : ''}`);
  }

  getAddress(address: string) {
    return this.request<Address>('GET', `/addresses/${encodeURIComponent(address)}`);
  }

  // Checks out an account matching every filter that nobody else holds, the
  // least recently used first, for `minutes` (default 10). Throws
  // ProxyMailQAError 409 when every match is checked out, 404 when none
  // match. Tag accounts with their state (verified, premium…) to make pools.
  checkOutAccount(options: CheckoutOptions = {}) {
    return this.request<CheckedOutAccount>('POST', '/addresses/checkout', {
      tags: options.tags,
      country: options.country,
      min_age: options.minAge,
      max_age: options.maxAge,
      has_password: options.hasPassword,
      search: options.search,
      minutes: options.minutes,
    });
  }

  // More time from now (default 10 minutes).
  extendCheckout(account: CheckedOutAccount, minutes?: number) {
    return this.request<{ address: string; checkout: { token: string; until: string } }>('POST', `/addresses/${encodeURIComponent(account.address)}/extend`, {
      token: account.checkout.token,
      minutes,
    });
  }

  // Frees it for the next test, recording any change to its state.
  returnAccount(account: CheckedOutAccount, state: ReturnState = {}) {
    return this.request<Address>('POST', `/addresses/${encodeURIComponent(account.address)}/return`, {
      token: account.checkout.token,
      add_tags: state.addTags,
      remove_tags: state.removeTags,
    });
  }

  // Checks out an account, runs fn with it, and always returns it. fn can
  // say what state it left the account in by returning { addTags, removeTags }.
  // With create, check and reset (PreparedAccountOptions), the account is
  // also confirmed to be in the state the test needs, a new one is made when
  // none is free, and its state is restored afterwards.
  async withAccount<T>(options: PreparedAccountOptions, fn: (account: CheckedOutAccount) => Promise<T>): Promise<T> {
    const account = await this.prepareAccount(options);
    let state: ReturnState = {};
    let result: T;
    try {
      result = await fn(account);
      if (result && typeof result === 'object' && ('addTags' in result || 'removeTags' in result)) state = result as ReturnState;
    } catch (err) {
      await this.restoreAccount(account, options, state).catch(() => {});
      throw err;
    }
    await this.restoreAccount(account, options, state);
    return result;
  }

  // A checked-out account in the state the test needs, or an error saying why
  // there isn't one.
  private async prepareAccount(options: PreparedAccountOptions): Promise<CheckedOutAccount> {
    const { create, check, reset, newAccount, attempts = 3, ...filters } = options;
    const tried: string[] = [];
    let lastProblem = '';
    for (let i = 0; i < attempts; i++) {
      let account: CheckedOutAccount;
      try {
        account = await this.checkOutAccount(filters);
      } catch (err) {
        if (!(err instanceof ProxyMailQAError && (err.status === 404 || err.status === 409))) throw err;
        // None matches, or every match is busy: make one, if the test can.
        if (create) return this.newAccount(options);
        // Accounts that failed their check have left the pool.
        if (tried.length) break;
        throw err;
      }
      // The pool has come round again: every match has been tried.
      if (tried.includes(account.address)) {
        await this.returnAccount(account).catch(() => {});
        break;
      }
      tried.push(account.address);
      let problem = await this.failedCheck(check, account);
      if (problem === null) return account;
      if (reset) {
        problem = await reset(account).then(
          () => this.failedCheck(check, account),
          (err: unknown) => `reset failed: ${message(err)}`,
        );
        if (problem === null) return account;
      }
      lastProblem = problem;
      await this.note(`Test account failed its check (${problem}); it loses its tags and is tagged check-failed.`, account.address);
      await this.returnAccount(account, { addTags: ['check-failed'], removeTags: filters.tags }).catch(() => {});
    }
    if (create) return this.newAccount(options);
    throw new Error(
      tried.length
        ? `No test account passed the check: tried ${tried.join(', ')}${lastProblem ? ` (last: ${lastProblem})` : ''}. Pass create to make one.`
        : 'No test account passed the check. Pass create to make one.',
    );
  }

  // Makes an account with the test's create hook, holding it from the start
  // so no parallel test takes it half made, then tags and checks it.
  private async newAccount(options: PreparedAccountOptions): Promise<CheckedOutAccount> {
    const { create, check, newAccount = {}, tags = [], country, minAge, maxAge, minutes } = options;
    if (!create) throw new Error('Pass create to make new accounts.');
    if ((minAge !== undefined || maxAge !== undefined) && !newAccount.age && !newAccount.dateOfBirth) {
      throw new Error('Give newAccount an age or dateOfBirth, so new accounts match minAge and maxAge.');
    }
    const created = await this.createAddress({ ...newAccount, country: newAccount.country ?? country, password: true });
    const held = await this.checkOutAccount({ search: created.address, minutes });
    if (held.address !== created.address) {
      await this.returnAccount(held).catch(() => {});
      throw new Error(`Couldn't hold the new account ${created.address}.`);
    }
    try {
      await create({ ...held, password: created.password });
      const tagged = await this.updateAddress(created.address, { tags: [...new Set([...held.tags, ...tags.map((t) => t.toLowerCase())])] });
      const account: CheckedOutAccount = { ...tagged, checkout: held.checkout };
      const ages = age(account.persona?.date_of_birth);
      if (ages !== null && ((minAge !== undefined && ages < minAge) || (maxAge !== undefined && ages > maxAge))) {
        throw new Error(`The new account is ${ages}, outside minAge and maxAge: give newAccount a matching age.`);
      }
      const problem = await this.failedCheck(check, account);
      if (problem !== null) throw new Error(`The new account ${created.address} failed its check after create: ${problem}`);
      await this.note(`Made a new test account${tags.length ? ` tagged ${tags.join(', ')}` : ''}.`, created.address);
      return account;
    } catch (err) {
      // Untagged, it stays out of the pool; it expires with its address.
      await this.updateAddress(created.address, { tags: held.tags }).catch(() => {});
      await this.returnAccount(held).catch(() => {});
      throw err;
    }
  }

  // null when the account passes (or there's no check), or why it doesn't.
  private async failedCheck(check: PreparedAccountOptions['check'], account: CheckedOutAccount): Promise<string | null> {
    if (!check) return null;
    try {
      return (await check(account)) === false ? 'check returned false' : null;
    } catch (err) {
      return message(err);
    }
  }

  // Runs reset, then returns the account. If reset fails, the account leaves
  // the pool's state (needs-reset) and the error is thrown.
  private async restoreAccount(account: CheckedOutAccount, options: PreparedAccountOptions, state: ReturnState): Promise<void> {
    if (options.reset) {
      try {
        await options.reset(account);
      } catch (err) {
        await this.note(`Couldn't reset the test account (${message(err)}); it loses its tags and is tagged needs-reset.`, account.address);
        await this.returnAccount(account, {
          addTags: [...(state.addTags ?? []), 'needs-reset'],
          removeTags: [...(state.removeTags ?? []), ...(options.tags ?? [])],
        }).catch(() => {});
        throw err;
      }
    }
    await this.returnAccount(account, state).catch(() => {});
  }

  // Adds a line to the current run, if there is one, without failing the test.
  private async note(text: string, address: string): Promise<void> {
    if (this.run) await this.addRunNote(text, { address }).catch(() => {});
  }

  updateAddress(address: string, patch: AddressPatch) {
    return this.request<Address>('PATCH', `/addresses/${encodeURIComponent(address)}`, patch);
  }

  deleteAddress(address: string) {
    return this.request<void>('DELETE', `/addresses/${encodeURIComponent(address)}`);
  }

  // Waits for a verification or login code; throws ProxyMailQAError (404) if
  // none arrives in time.
  waitForCode(address: string, options: WaitOptions = {}) {
    return this.wait(address, 'code', options);
  }

  // Waits for a verify, magic sign-in, invite or reset link. When an email has
  // both a web link and one that opens a mobile app (myapp://…), the web link
  // comes first: app: true asks for the app one, app: false for a web one.
  waitForLink(address: string, options: WaitOptions & { type?: LinkType | LinkType[]; app?: boolean } = {}) {
    return this.wait(address, 'link', options, [options.type ?? []].flat().join(','), options.app);
  }

  // Emails with their codes and links. includeText and includeHtml add each
  // email's content, for tests that check the email itself; it's written by
  // the sender, so treat it as untrusted. The HTML is the copy cleaned when
  // the email arrived.
  messages(address: string, options: { includeText?: boolean; includeHtml?: boolean; limit?: number } = {}) {
    const query = new URLSearchParams();
    const include = [options.includeText && 'text', options.includeHtml && 'html'].filter(Boolean);
    if (include.length) query.set('include', include.join(','));
    if (options.limit) query.set('limit', String(options.limit));
    return this.request<Array<Record<string, unknown>>>('GET', `/addresses/${encodeURIComponent(address)}/messages${query.size ? `?${query}` : ''}`);
  }

  // How many emails reached the address (since a time, from a service, with a
  // code or link), each summarised without its content. Doesn't wait: count
  // after the wait for the first email returns, so a duplicate has had time
  // to arrive. Without since, every email the address has received.
  countEmails(address: string, options: CountOptions = {}) {
    return this.request<EmailCount>('GET', `/addresses/${encodeURIComponent(address)}/count${countQuery(options)}`);
  }

  // Checks one email the address received: SPF, DKIM and DMARC, links to
  // localhost or plain http, where its link goes (expectHost), a stated
  // expiry, a plain-text part, size and image-only emails, and given phrases
  // (expectText) and its language (expectLanguage). Doesn't wait: wait for
  // the email first. Throws ProxyMailQAError (404) when none matches.
  checkEmail(address: string, options: CheckOptions = {}) {
    const extra: Record<string, string> = {};
    if (options.emailId) extra.email_id = options.emailId;
    if (options.expectHost) extra.expect_host = options.expectHost;
    if (options.expectLanguage) extra.expect_language = options.expectLanguage;
    let query = countQuery(options, extra);
    for (const phrase of options.expectText ?? []) query += `${query ? '&' : '?'}expect_text=${encodeURIComponent(phrase)}`;
    return this.request<EmailChecks>('GET', `/addresses/${encodeURIComponent(address)}/checks${query}`);
  }

  // Resolves when no matching email arrives within timeout seconds (default
  // 30; longer repeats the request), for checks such as "an unsubscribed user
  // gets nothing". Throws ProxyMailQAError (status 409, code email_arrived)
  // as soon as one does. Pass since as the time of the action, so an email
  // that came before the call still counts; without it, from now.
  async expectNoEmail(address: string, options: CountOptions & { timeout?: number } = {}): Promise<NoEmail> {
    const deadline = Date.now() + (options.timeout ?? MAX_WAIT_SECONDS) * 1000;
    let since = options.since;
    for (;;) {
      const left = Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.ceil((deadline - Date.now()) / 1000)));
      const query = countQuery({ ...options, since }, { timeout: String(left) });
      const more = Date.now() + left * 1000 < deadline - 500;
      const result = await this.request<NoEmail>('GET', `/addresses/${encodeURIComponent(address)}/none${query}`, undefined, more);
      // The server's since, so later requests watch from the same moment
      // whatever this machine's clock says.
      since = result.since;
      if (Date.now() >= deadline - 500) return { address: result.address, since: result.since, until: result.until };
    }
  }

  // What reached the address and what was refused, without waiting: for when
  // a wait comes back empty.
  checkDelivery(address: string) {
    return this.request<DeliveryStatus>('GET', `/addresses/${encodeURIComponent(address)}/delivery`);
  }

  variants(address: string) {
    return this.request<Variants>('GET', `/addresses/${encodeURIComponent(address)}/variants`);
  }

  // Saves the password the test account uses now, after the app under test
  // changed or reset it. Without one, a strong password is generated and
  // returned this once.
  setPassword(address: string, options: { password: string; label?: string }): Promise<SavedPassword>;
  setPassword(address: string, options?: { password?: undefined; label?: string }): Promise<SavedPassword & { password: string }>;
  setPassword(address: string, options: { password?: string; label?: string } = {}): Promise<SavedPassword> {
    return this.request<SavedPassword>(
      'PUT',
      `/addresses/${encodeURIComponent(address)}/password`,
      { password: options.password, label: options.label },
    );
  }

  // Needs a key created with "Can read saved passwords"; every reveal is logged.
  savedPassword(address: string, label = 'password') {
    return this.request<{ address: string; label: string; secret: string }>(
      'GET',
      `/addresses/${encodeURIComponent(address)}/password?label=${encodeURIComponent(label)}`,
    );
  }

  // Starts a run: a CI job or agent session whose calls add what they saw
  // (addresses, emails and how long after since, codes, a link's site and
  // path, checks, and emails that never came). This client's later calls add
  // to it; to add calls from other processes, pass them its id as
  // PROXYMAIL_QA_RUN. The GitHub Action starts and finishes one for you.
  async startRun(input: RunInput = {}): Promise<Run> {
    const run = await this.request<Run>('POST', '/runs', input);
    this.run = run.id;
    return run;
  }

  getRun(id = this.requireRun()) {
    return this.request<Run>('GET', `/runs/${encodeURIComponent(id)}`);
  }

  // The report in Markdown, for a pull request comment or a job summary.
  runReport(id = this.requireRun()) {
    return this.request<string>('GET', `/runs/${encodeURIComponent(id)}?format=markdown`);
  }

  listRuns(limit?: number) {
    return this.request<{ runs: Run[] }>('GET', `/runs${limit ? `?limit=${limit}` : ''}`).then((r) => r.runs);
  }

  // A line of your own in the run, such as a test that failed for a reason
  // of its own. failed: true fails the run.
  addRunNote(text: string, options: { failed?: boolean; address?: string; run?: string } = {}) {
    const id = options.run ?? this.requireRun();
    return this.request<void>('POST', `/runs/${encodeURIComponent(id)}/notes`, { text, failed: options.failed ?? false, address: options.address });
  }

  // Passed unless an email was missing, came when none should have, failed
  // a check, or failed says your tests failed.
  async finishRun(options: { failed?: boolean; run?: string } = {}): Promise<Run> {
    const id = options.run ?? this.requireRun();
    const run = await this.request<Run>('POST', `/runs/${encodeURIComponent(id)}/finish`, { failed: options.failed ?? false });
    if (this.run === id) this.run = null;
    return run;
  }

  private requireRun(): string {
    if (!this.run) throw new Error('No run: call startRun first, or set PROXYMAIL_QA_RUN.');
    return this.run;
  }

  private async wait(address: string, kind: 'code' | 'link', options: WaitOptions, type = '', app?: boolean): Promise<Match> {
    const total = options.timeout ?? MAX_WAIT_SECONDS;
    const deadline = Date.now() + total * 1000;
    const since = options.since === undefined ? undefined : new Date(options.since).toISOString();
    for (;;) {
      const left = Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.ceil((deadline - Date.now()) / 1000)));
      const query = new URLSearchParams({ timeout: String(left) });
      if (options.service) query.set('service', options.service);
      if (since) query.set('since', since);
      if (type) query.set('type', type);
      if (app !== undefined) query.set('app', String(app));
      if (options.unused) query.set('unused', 'true');
      const more = Date.now() + left * 1000 < deadline - 500;
      try {
        return await this.request<Match>('GET', `/addresses/${encodeURIComponent(address)}/${kind}?${query}`, undefined, more);
      } catch (error) {
        const timedOut = error instanceof ProxyMailQAError && error.status === 404 && TIMED_OUT.test(error.message);
        if (!timedOut || Date.now() >= deadline - 500) throw error;
      }
    }
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Whole years from a YYYY-MM-DD date of birth, or null without one.
function age(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const now = new Date();
  return now.getUTCFullYear() - y! - (now.getUTCMonth() + 1 < m! || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d!) ? 1 : 0);
}
