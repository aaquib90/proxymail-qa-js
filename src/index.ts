// A small client for the Proxy Mail QA REST API (https://proxymail.qa/docs/api):
// create disposable test inboxes and wait for the verification code or link
// from the email the app under test sends. No dependencies; works in Node 18+,
// Playwright, Cypress tasks and other runtimes with fetch.

export interface ClientOptions {
  // Defaults to the PROXYMAIL_QA_API_KEY environment variable.
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
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

// expectNoEmail's answer: nothing matching arrived between since and until.
export interface NoEmail {
  address: string;
  since: string;
  until: string;
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

  constructor(options: ClientOptions = {}) {
    const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PROXYMAIL_QA_API_KEY;
    const apiKey = options.apiKey ?? fromEnv;
    if (!apiKey) throw new Error('Pass apiKey or set PROXYMAIL_QA_API_KEY. Create a key in Project settings → API keys.');
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.proxymail.qa').replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
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

  listAddresses(options: { limit?: number; before?: string } = {}) {
    const query = new URLSearchParams();
    if (options.limit) query.set('limit', String(options.limit));
    if (options.before) query.set('before', options.before);
    return this.request<Address[]>('GET', `/addresses${query.size ? `?${query}` : ''}`);
  }

  getAddress(address: string) {
    return this.request<Address>('GET', `/addresses/${encodeURIComponent(address)}`);
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
      const result = await this.request<NoEmail>('GET', `/addresses/${encodeURIComponent(address)}/none${query}`);
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
      try {
        return await this.request<Match>('GET', `/addresses/${encodeURIComponent(address)}/${kind}?${query}`);
      } catch (error) {
        const timedOut = error instanceof ProxyMailQAError && error.status === 404 && TIMED_OUT.test(error.message);
        if (!timedOut || Date.now() >= deadline - 500) throw error;
      }
    }
  }
}
