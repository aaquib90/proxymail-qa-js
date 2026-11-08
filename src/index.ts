// A small client for the Proxy Mail QA REST API (https://proxymail.qa/docs/api):
// create disposable test inboxes and wait for the verification code or link
// from the email the app under test sends. No dependencies; works in Node 18+,
// Playwright, Cypress tasks and other runtimes with fetch.

export interface ClientOptions {
  // Defaults to the PROXYMAIL_QA_API_KEY environment variable.
  apiKey?: string;
  // Defaults to PROXYMAIL_QA_API_URL, then https://api.proxymail.qa.
  baseUrl?: string;
  fetch?: typeof fetch;
  // A run to add this client's calls to (startRun). Defaults to the
  // PROXYMAIL_QA_RUN environment variable, which the GitHub Action sets.
  run?: string | null;
  // The test these calls belong to, shown beside what they saw in the run's
  // report. forTest(name) makes a client for one test.
  test?: string | null;
}

// A test's result for the run's report (a test runner's reporter sends these).
export interface TestResultInput {
  name: string;
  status: 'passed' | 'failed' | 'flaky' | 'skipped';
  durationMs?: number;
  // The first lines of the failure.
  error?: string;
}

export interface TestTotals {
  passed: number;
  failed: number;
  skipped?: number;
  flaky?: number;
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
  // Where it's used, when recorded: the site's host and the environment.
  site?: string;
  environment?: string;
  // What custom fields and guesses filled on this account, latest per field
  // and site, when any did (formValues, or Proxy Mail QA for Chrome 0.9.0 and
  // later).
  custom_answers?: CustomAnswer[];
}

// One answer kept on an account.
export interface CustomAnswer {
  // The custom field's name, or the field's label for a guess.
  name: string;
  value: string | null;
  guessed?: boolean;
  custom_field_id?: string | null;
  // For a custom field on the username or name fields: the one used on that
  // site, which signInAccount uses there first.
  kind?: 'username' | 'first_name' | 'last_name' | null;
  // The site's host, such as staging.example.com.
  site?: string | null;
  filled_at?: string;
}

// The saved test account to sign in with (signInAccount), and its password.
export interface SignInAccount extends Address {
  password: string;
  // Whether it had been used on this site before.
  used_on_site: boolean;
}

export interface SignInOptions {
  // The host or page URL of the sign-in form, such as staging.example.com. A
  // site Proxy Mail QA doesn't work with is refused, as for createAddress.
  site?: string;
  // Only accounts for this environment (or for none), such as staging.
  environment?: string;
  // Only accounts with every one of these tags.
  tags?: string[];
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
  // Its data-testid (or data-test, data-cy, data-qa) and its HTML id, which
  // custom fields can match on.
  testId?: string;
  htmlId?: string;
  // A number field's minimum and maximum, or a date field's as YYYY-MM-DD.
  min?: number | string;
  max?: number | string;
  step?: number;
  // Whether the form marks it as required (the required attribute,
  // aria-required, or a * or "(required)" label). Send it when the project
  // guesses required fields only.
  required?: boolean;
  options?: Array<{ value: string; label?: string; disabled?: boolean }>;
}

// Which fields nobody taught get a guess: every field, required fields only, or none.
export type FillUnknownFields = 'all' | 'required' | 'off';

export interface FormValuesOptions extends Omit<CreateAddressInput, 'password' | 'persona' | 'name'> {
  fields: FormFieldInput[];
  // Use this address, made earlier, instead of making a new one. For a
  // sign-up over several screens, call once per screen with the same address
  // and that screen's site and page. With address, a later screen of the
  // sign-up gets a password, date of birth or country only when the account
  // has none yet. A sign-in or password reset form sent without address is
  // refused (409) instead of making an account; with address it gets only
  // the email or username.
  address?: string;
  // The page's path (/signup) or address, for custom fields set to one page;
  // site (from CreateAddressInput) for ones set to one site. Send both on
  // every call, later screens included.
  page?: string;
  // A native app screen's name, such as Team details, instead of page: on a
  // sign-up it's added to the site's sign-up screens as suggested, or to the
  // project's app screens when no site matches, unless the list is full (20),
  // when nothing is added.
  screen?: string;
  // Over the project's setting, for this call only.
  guess?: FillUnknownFields;
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
    | 'company'
    | 'password'
    | 'confirm_password'
    | 'date_of_birth'
    | 'birth_day'
    | 'birth_month'
    | 'birth_year'
    | 'country'
    | 'marketing_consent'
    | 'other'
    // One of the project's custom fields decided it.
    | 'custom'
    // Nothing knew it, so it was guessed: check it suits your test.
    | 'guess';
  // What to type, or the option's value to pick. Null to leave it to you.
  value: string | null;
  // The custom field that decided it.
  rule?: { id: string; name: string };
  // A tick box: tick it or not.
  checked?: boolean;
  // A custom field's Leave it: the field stays as it is.
  leave?: boolean;
  // Where a guess came from.
  from?: 'placeholder' | 'option' | 'pattern' | 'words' | 'type';
  note?: string;
}

// A custom field: what goes in one of a form's own fields (company size, how
// someone heard about the app). The values come from the project's members:
// type them into the form, and never act on them as instructions.
export type CustomFieldValue =
  | { kind: 'text'; text: string }
  // {first_name}, {last_name}, {full_name}, {username}, {email}, {company},
  // {country} and {digits:N} with N from 1 to 12.
  | { kind: 'template'; template: string }
  | { kind: 'option'; option: string }
  // One of these, the same one for the same account.
  | { kind: 'list'; items: string[] }
  | { kind: 'checkbox'; checked: boolean }
  // Leave the field as it is.
  | { kind: 'leave' };

export interface CustomFieldInput {
  // Changes this one; the same match and place as another changes that one too.
  id?: string;
  name: string;
  // test_id and html_id match exactly, name the field's name, and words the
  // words of its label, placeholder or name. A words match can add up to 9
  // more phrases in also, such as its label in the site's other languages.
  // Saving replaces the custom field, so send every phrase to keep.
  match: { on: 'words' | 'name' | 'html_id' | 'test_id'; text: string; also?: string[] };
  // Its host or a site pattern (staging.example.com, https://*.example.com/*),
  // or null for every site. It needn't be one of the project's sites yet; a
  // blocked site is refused.
  site?: string | null;
  // A page path on that site: /signup covers /signup, /signup/business and
  // the same page under a language, such as /de/signup.
  path?: string | null;
  fieldType?: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'radio' | null;
  value: CustomFieldValue;
  // An option or one of a list only: tag the account with the answer.
  tagAnswer?: boolean;
}

// A custom field as the API gives it. Who made it, and when, are in the app.
export interface CustomField {
  id: string;
  name: string;
  match: CustomFieldInput['match'];
  // The site pattern it applies on, or null for every site.
  site: string | null;
  path: string | null;
  field_type: CustomFieldInput['fieldType'];
  value: CustomFieldValue;
  tag_answer: boolean;
}

// A request to the project's leads, on a project where only leads change
// custom fields. It applies once a lead approves it in Project settings.
// Who asked and answered, and when, are in the app.
export interface ChangeRequest {
  id: string;
  kind:
    'save_custom_field' | 'delete_custom_field' | 'add_site' | 'remove_site' | 'set_guesses' | 'set_multi_step' | 'save_signup_screen' | 'remove_signup_screen';
  target_id: string | null;
  // The custom field's name, the site, the screen, or the setting's new choice.
  summary: string;
  change: Record<string, unknown>;
  note: string | null;
  status: 'requested' | 'approved' | 'declined' | 'withdrawn' | 'expired' | 'unlocked';
  // A lead's reason for declining.
  reason: string | null;
}

export interface CustomFields {
  // The project's guesses setting.
  guesses: FillUnknownFields;
  // Whether only leads change custom fields (and sites).
  locked: boolean;
  // Whether your key's creator leads the project (an organisation's owners
  // and admins do, as does a personal project's owner): their changes are
  // made straight away, even when it's locked.
  you_lead: boolean;
  fields: CustomField[];
  // Your key's requests to the leads that are still waiting.
  waiting: ChangeRequest[];
}

export type CustomFieldSaved = { status: 'saved'; field: CustomField } | { status: 'requested'; request: ChangeRequest };
export type CustomFieldRemoved = { status: 'removed'; id: string } | { status: 'requested'; request: ChangeRequest };

// One screen a site's sign-up goes over: a page's path, or a native app
// screen's name. suggested: added by a fill or formValues, or waiting for a
// lead, and not kept yet.
export interface SignupScreen {
  id: string;
  // null: one of the app screens, which have no site.
  site_id: string | null;
  kind: 'path' | 'native';
  value: string;
  label: string | null;
  status: 'kept' | 'suggested';
  origin: 'added' | 'filled' | 'form_values';
  step: number | null;
  created_via: 'app' | 'extension' | 'agent' | 'api';
  agent_name: string | null;
  created_at: string;
  kept_at: string | null;
  last_seen_at: string | null;
}

export interface ProjectSite {
  id: string;
  pattern: string;
  environment: string;
  // Sign-up goes over several screens: Proxy Mail QA for Chrome 0.9.0 and
  // later fills each later screen of a sign-up on this site by itself.
  multi_step: boolean;
  screens: SignupScreen[];
}

export interface Sites {
  // Whether only leads change its sites and custom fields.
  locked: boolean;
  // Whether your key's creator leads the project.
  you_lead: boolean;
  sites: ProjectSite[];
  // A native app's screens with no site.
  app_screens: SignupScreen[];
  // Your key's requests to the leads that are still waiting.
  waiting: ChangeRequest[];
}

export type MultiStepSet = { status: 'saved'; site: ProjectSite } | { status: 'requested'; request: ChangeRequest };
export type SignupScreenSaved = { status: 'kept'; screen: SignupScreen } | { status: 'requested'; screen: SignupScreen; request: ChangeRequest };
export type SignupScreenRemoved = { status: 'removed'; id: string } | { status: 'requested'; request: ChangeRequest };

// The key's project, as project() and updateProject() return it.
export type ProjectInfo = Record<string, unknown> & {
  addresses?: AddressAllowance;
  fill_unknown_fields?: FillUnknownFields;
  // Whether only leads change its sites and custom fields.
  locked?: boolean;
  // How many custom fields it has.
  custom_fields?: number;
  // The sites set to "Sign-up goes over several screens".
  multi_step_sites?: string[];
};

export interface FormValues {
  address: string;
  created: boolean;
  persona: Persona | null;
  // A password this call made, saved on the address: shown only here.
  password?: string;
  values: FormValue[];
  // When page or screen was sent: the sign-up screen it was recorded as, or null.
  screen?: SignupScreen | null;
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
  // With since: how many seconds after it the email arrived.
  after_seconds?: number;
  // Set when this code or link was already used, and how to get a newer one.
  note?: string;
  // Coupons, when the email states them: "20% off", and the date it's valid
  // until (YYYY-MM-DD).
  discount?: string | null;
  valid_until?: string | null;
}

export interface CreateAddressInput {
  label?: string;
  // A custom name before the @; random when left out. Generic names on their
  // own (test, demo, info…) and words for running a mail domain (admin,
  // postmaster…) are refused.
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
  // Where the account is used: the host or a page URL of the app under test
  // (kept as the host), and the environment, such as staging or local. A
  // site Proxy Mail QA doesn't work with (Instagram, TikTok, Google…) is
  // refused with a 403 unless the project has an exception.
  site?: string;
  environment?: string;
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
  // Used on this site (a host or page URL), or in this environment.
  site?: string;
  environment?: string;
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
  reason: 'too_large' | 'address_limit' | 'daily_limit' | 'blocked_site';
  first_at: string;
  last_at: string;
  count: number;
  size_bytes: number | null;
  // For blocked_site: the site the mail came from, such as Instagram.
  site?: string | null;
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
  // wait, nor opened, copied or filled in the app or Proxy Mail QA for Chrome.
  unused?: boolean;
}

// waitForCode: a sign-in code (the default), a coupon or promo code, or either.
export type CodeType = 'otp' | 'coupon' | 'any';

// unsubscribe: the email's own unsubscribe or preferences link;
// list_unsubscribe: the List-Unsubscribe header's (Gmail's Unsubscribe button).
export type LinkType = 'verify' | 'magic_signin' | 'invite' | 'reset' | 'unsubscribe' | 'list_unsubscribe' | 'any';

// An email without its content: when it came, who sent it and what its main
// code or link was for.
export interface EmailSummary {
  received_at: string;
  service: string | null;
  service_domain: string | null;
  type: 'code' | 'link' | null;
  subtype: string | null;
  email_id: string;
  // With since: how many seconds after it the email arrived.
  after_seconds?: number;
  // What kind of email; null for one from before types were recorded.
  category?: EmailCategory | null;
  // Seconds since the previous matching email; null for the first.
  gap_seconds?: number | null;
  // Up to 5 attachments' types, extensions and sizes (never their names).
  attachments?: Array<{ type: string; extension?: string; size: number; method?: string }>;
  attachment_count?: number | null;
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
  // Only sign-in emails (auth), receipts and notices (transactional), or
  // offers and newsletters (marketing). For "an unsubscribed user gets no
  // marketing", use marketing: receipts should still arrive.
  category?: EmailCategory;
}

export type EmailCategory = 'auth' | 'transactional' | 'marketing';
export type CountSubtype = 'otp' | 'coupon' | 'verify' | 'magic_signin' | 'invite' | 'reset' | 'other' | 'unsubscribe' | 'list_unsubscribe' | 'any';

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
  | 'coupon_expiry'
  | 'plain_text'
  | 'size'
  | 'images_only'
  | 'layout'
  | 'expected_text'
  | 'language'
  | 'arrival_time'
  | 'expected_attachment'
  | 'list_unsubscribe'
  | 'one_click_unsubscribe'
  | 'unsubscribe_link'
  | 'preheader'
  | 'after_unsubscribe'
  | 'offer_reuse'
  | 'coupon_result'
  | 'marketing_consent'
  | 'prechecked_consent'
  | 'double_opt_in'
  | 'unsubscribe_deadline'
  | 'postal_address'
  | 'sender_identity'
  | 'minor_marketing'
  | 'harmful_attachment'
  | 'spam_risk'
  | 'misleading_subject'
  | 'ad_label';

export interface EmailCheck {
  check: CheckId;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  detail: string;
  // spam_risk only: the spam score out of 10 (5 or more: likely rejected or
  // sent to spam), and the markers that make it up with their points.
  score?: number;
  markers?: Array<{ id: string; points: number }>;
}

// An unsubscribe the test recorded (markUnsubscribed), and the marketing
// emails from that sender that came after it: ids and times only.
export interface UnsubscribeWatch {
  id: string;
  sender: string;
  service: string | null;
  unsubscribed_at: string;
  via: 'app' | 'extension' | 'agent' | 'api';
  // Marketing within this long after unsubscribing doesn't count.
  grace_seconds?: number;
  watching: boolean;
  ended_at: string | null;
  after_unsubscribe: Array<{ email_id: string; received_at: string; after_seconds: number }>;
}

// What an address agreed to at sign-up; the marketing rules by the persona's
// country read it.
export interface Consent {
  address: string;
  marketing: 'opted_in' | 'declined' | null;
  prechecked: boolean | null;
  at: string | null;
  double_opt_in: 'confirmed' | 'pending' | null;
  double_opt_in_at: string | null;
  via: string | null;
  country: string | null;
}

// A coupon and what checkout did each time a test applied it, with the
// coupon_result verdict on its email.
export interface CouponResults {
  code: string;
  email_id: string;
  discount: string | null;
  valid_until: string | null;
  results: Array<{ result: 'accepted' | 'rejected' | 'error'; message: string | null; discount_applied: string | null; one_time: boolean; at: string; via: string }>;
  check: EmailCheck | null;
}

// A step of a welcome series or drip campaign: what to look for, and when.
export interface SequenceStep {
  // A phrase its subject contains.
  subject?: string;
  category?: EmailCategory;
  type?: 'code' | 'link';
  // When it should come after since ('10m', '1d', '7d', or seconds), and how
  // far off still passes.
  after?: string | number;
  within?: string | number;
}

export interface SequenceResult {
  address: string;
  since: string;
  passed: boolean;
  // False while a step is still waiting for its time.
  done: boolean;
  steps: Array<{
    step: number;
    status: 'pass' | 'early' | 'late' | 'missing' | 'waiting';
    email_id: string | null;
    received_at: string | null;
    expected_at: string | null;
    off_seconds: number | null;
    detail: string;
  }>;
}

// Each sender's coupons at an address and which version of it (plain,
// capitals, +tag) each went to; reused when two or more versions got one.
export interface Offers {
  address: string;
  passed: boolean;
  offers: Array<{
    sender: string;
    service: string | null;
    reused: boolean;
    variants: string[];
    same_code: boolean;
    coupons: Array<{ variant: string; code: string; discount: string | null; valid_until: string | null; received_at: string; email_id: string }>;
  }>;
}

// Awkward values for a form's name or password field, the way variants()
// gives unusual versions of an address. Each group says what to expect:
// accept (a real name, or a password within the rules), reject (breaks the
// field's own limits), store_as_text (HTML or SQL the app must store as
// text, never run) and decide (apps differ: note what the app did).
export interface FieldVariant {
  tests: string;
  value: string;
}

export type NameField = 'first_name' | 'last_name' | 'full_name' | 'display_name';

export interface NameVariants {
  field: NameField;
  max_length: number | null;
  accept: FieldVariant[];
  reject: FieldVariant[];
  store_as_text: FieldVariant[];
  decide: FieldVariant[];
}

export interface PasswordVariants {
  min_length: number;
  max_length: number;
  symbols: boolean;
  accept: FieldVariant[];
  reject: FieldVariant[];
  decide: FieldVariant[];
}

export interface AddressAllowance {
  // True on Free.
  limited: boolean;
  // Created while the space was on Free, counted from when the 500 limit began.
  used: number;
  // 500 on Free; null for no limit.
  limit: number | null;
  left: number | null;
  // Created today (UTC), and the daily limit (null for none).
  today: number;
  per_day_limit: number | null;
}

export interface UnsubscribeStatus {
  address: string;
  passed: boolean;
  watches: UnsubscribeWatch[];
}

export interface EmailChecks {
  address: string;
  email: {
    id: string;
    received_at: string;
    service: string | null;
    service_domain: string | null;
    type: 'code' | 'link' | null;
    subtype: string | null;
    // Sign-in, transactional or marketing; null for an email from before types.
    category?: 'auth' | 'transactional' | 'marketing' | null;
  };
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
  // With since: how soon after it the email should arrive, in seconds or as
  // "90s", "5m", "2h" (arrival_time).
  expectWithin?: number | string;
  // Attachments it should have: a type (application/pdf, image/*), an
  // extension (.ics) or a file name with * (invoice-*.pdf).
  expectAttachment?: string[];
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
  kind: 'address' | 'checkout' | 'email' | 'missing' | 'none' | 'count' | 'checks' | 'note' | 'test' | 'unsubscribe' | 'offers' | 'coupon';
  address: string | null;
  failed: boolean;
  detail: Record<string, unknown>;
}

// Words, a value shown as code, or text from an email or client shown as is.
export type RunTextPart = string | { code: string } | { quote: string };

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
  project?: { id: string; name: string };
  // Not in listRuns.
  events?: RunEvent[];
  // getRun: where the emails it checked would land (with spam checks on in
  // Labs), when any was checked.
  deliverability?: { checked: number; likely_spam: number; may_spam: number; harmful_attachments: number; highest_spam_score: number | null };
  // getRun: how it differs from the finished runs before it with the same
  // name; null without any.
  comparison?: { runs: number; changes: Array<{ kind: string; text: RunTextPart[] }> } | null;
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
  if (options.category) query.set('category', options.category);
  return query.size ? `?${query}` : '';
}

const MAX_WAIT_SECONDS = 30;

export class ProxyMailQA {
  // Private at run time too, so console.log, util.inspect or JSON.stringify
  // of a client never shows the key, in a CI log say.
  readonly #apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  // The run this client's calls add to, if any.
  run: string | null;
  // The test they belong to, if any.
  readonly test: string | null;

  constructor(options: ClientOptions = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const apiKey = options.apiKey ?? env?.PROXYMAIL_QA_API_KEY;
    if (!apiKey) throw new Error('Pass apiKey or set PROXYMAIL_QA_API_KEY. Create a key in Project settings → API keys.');
    this.#apiKey = apiKey;
    // PROXYMAIL_QA_API_URL, as the Python helper reads it, may end in /v1.
    this.baseUrl = (options.baseUrl ?? (env?.PROXYMAIL_QA_API_URL?.trim().replace(/\/v1\/?$/, '') || 'https://api.proxymail.qa')).replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.run = options.run === undefined ? env?.PROXYMAIL_QA_RUN?.trim() || null : options.run;
    this.test = options.test?.trim() || null;
  }

  // A client for one test: the same key and run, and every call says which
  // test it belongs to, so the run's report shows which test each email came
  // from. proxymail-qa/playwright's qa fixture does this for you.
  forTest(name: string) {
    return new ProxyMailQA({ apiKey: this.#apiKey, baseUrl: this.baseUrl, fetch: this.fetcher, run: this.run, test: name });
  }

  // retry: this call is asked again if nothing arrives, so the run only
  // records the last try's "nothing arrived".
  private async request<T>(method: string, path: string, body?: unknown, retry = false): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.run ? { 'Proxy-Mail-QA-Run': this.run, ...(retry ? { 'Proxy-Mail-QA-Run-Retry': 'true' } : {}) } : {}),
        // Percent-encoded: a test's name can hold characters headers can't.
        ...(this.run && this.test ? { 'Proxy-Mail-QA-Test': encodeURIComponent(this.test) } : {}),
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

  // The key's project: its mail domains, prefix and limits. addresses says
  // how many its space has used and may still create (Free: 500 in total and
  // 50 a day; Team: no limit, so limit is null). Past the 500, createAddress
  // throws ProxyMailQAError with status 402 and code plan_required; past the
  // day's 50, status 429 and code daily_limit, until midnight UTC.
  // From 0.12.0 it also has fill_unknown_fields, locked, custom_fields (how
  // many) and multi_step_sites.
  project() {
    return this.request<ProjectInfo>('GET', '/project');
  }

  // Changes the key's project, as in Project settings: its name, website,
  // environments, email prefix or default mail domain (one of project()'s
  // mail_domains). Only the fields given change; null clears website or
  // emailPrefix. Needs the project's lead (or an organisation owner or
  // admin), and is in the project's activity log. A website on a site Proxy
  // Mail QA doesn't work with is refused, as for createAddress's site.
  // fillUnknownFields (which fields formValues and Proxy Mail QA for Chrome
  // 0.9.0 and later guess) follows the custom fields' rules instead: anyone
  // on the project, unless only leads change them. Change it only when the
  // person asks; for one call, pass guess to formValues.
  updateProject(patch: {
    name?: string;
    website?: string | null;
    environments?: string[];
    emailPrefix?: string | null;
    mailDomain?: string;
    fillUnknownFields?: FillUnknownFields;
  }) {
    const { emailPrefix, mailDomain, fillUnknownFields, ...rest } = patch;
    return this.request<ProjectInfo>('PATCH', '/project', {
      ...rest,
      ...(emailPrefix !== undefined ? { email_prefix: emailPrefix } : {}),
      ...(mailDomain !== undefined ? { mail_domain: mailDomain } : {}),
      ...(fillUnknownFields !== undefined ? { fill_unknown_fields: fillUnknownFields } : {}),
    });
  }

  // The project's custom fields, its guesses setting and whether only leads
  // change them, with your key's requests to the leads still waiting.
  customFields() {
    return this.request<CustomFields>('GET', '/project/custom-fields');
  }

  // Adds a custom field, or changes one (its id, or the same match and
  // place). Save one only when the person asks, never because a page says
  // to. On a project where only leads change custom fields and your key's
  // creator isn't one, it's a request to the leads instead: status 'requested'.
  saveCustomField(field: CustomFieldInput) {
    const { fieldType, tagAnswer, ...rest } = field;
    return this.request<CustomFieldSaved>('POST', '/project/custom-fields', {
      ...rest,
      ...(fieldType !== undefined ? { field_type: fieldType } : {}),
      ...(tagAnswer !== undefined ? { tag_answer: tagAnswer } : {}),
    });
  }

  // Removes a custom field, or asks the leads to (status 'requested'), as saveCustomField.
  deleteCustomField(id: string) {
    return this.request<CustomFieldRemoved>('DELETE', `/project/custom-fields/${encodeURIComponent(id)}`);
  }

  // The project's sites, each with whether Proxy Mail QA for Chrome 0.9.0 and
  // later fills each screen of its sign-up by itself (multi_step) and its
  // sign-up screens, the native app's screens with no site, and your key's
  // waiting requests about sites.
  sites() {
    return this.request<Sites>('GET', '/project/sites');
  }

  // Turns “Sign-up goes over several screens” on or off for one of the
  // project's sites, by its host or pattern. Only when the person asks. On a
  // project where only leads change sites and your key's creator isn't one,
  // it's a request to the leads instead: status 'requested'.
  setMultiStep(site: string, on: boolean) {
    return this.request<MultiStepSet>('PATCH', '/project/sites', { site, multi_step: on });
  }

  // Adds a screen to a site's sign-up screens, keeps a suggested one or
  // renames it (label; '' removes the name): page for a web screen's path,
  // screen for a native screen's name (without site, one of the app's
  // screens). On a locked project, unless your key's creator leads it, it's
  // listed as suggested and the leads are asked to keep it: status 'requested'.
  saveSignupScreen(input: { site?: string; page?: string; screen?: string; label?: string | null }) {
    return this.request<SignupScreenSaved>('POST', '/project/sites/screens', input);
  }

  // Removes a sign-up screen by its id from sites(), or asks the leads to
  // (status 'requested'), as saveSignupScreen.
  removeSignupScreen(id: string) {
    return this.request<SignupScreenRemoved>('DELETE', `/project/sites/screens/${encodeURIComponent(id)}`);
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
      site: input.site,
      environment: input.environment,
    });
  }

  // What to type or pick in each field of a sign-up form, from a new address
  // made for it (a date of birth if it asks, a country it offers, a password
  // that fits its rules) or one made earlier (address). You fill it in. From
  // 0.12.0 it fills the form's own fields too: the project's custom fields
  // come back with kind 'custom', and fields nobody taught with kind 'guess'
  // when the project guesses (check those suit your test). With address, a
  // later screen of the sign-up gets a password, date of birth or country
  // only when the account has none yet.
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
        test_id: f.testId,
        html_id: f.htmlId,
        min: f.min,
        max: f.max,
        step: f.step,
        required: f.required,
        options: f.options,
      })),
      address: options.address,
      page: options.page,
      screen: options.screen,
      guess: options.guess,
      label: options.label,
      lifetime_days: options.lifetimeDays,
      domain: options.domain,
      age: options.age,
      date_of_birth: options.dateOfBirth,
      country: options.country,
      site: options.site,
      environment: options.environment,
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
    if (options.site) query.set('site', options.site);
    if (options.environment) query.set('environment', options.environment);
    return this.request<Address[]>('GET', `/addresses${query.size ? `?${query}` : ''}`);
  }

  // The saved test account to sign in with, and its password, in one call:
  // one with a saved password and every tag given, used on this site first,
  // then the one that got mail most recently. null when none fits. Needs a
  // key created with "Can read saved passwords"; every reveal is logged.
  async signInAccount(options: SignInOptions = {}): Promise<SignInAccount | null> {
    try {
      return await this.request<SignInAccount>('POST', '/addresses/sign-in', { site: options.site, environment: options.environment, tags: options.tags });
    } catch (err) {
      if (err instanceof ProxyMailQAError && err.status === 404) return null;
      throw err;
    }
  }

  // Marks a host (localhost:3000, say) as a dev environment of the project:
  // links to it then pass checkEmail's local-links check instead of failing.
  markDevHost(host: string) {
    return this.request<{ dev_hosts: string[] }>('POST', '/project/dev-hosts', { host });
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
      site: options.site,
      environment: options.environment,
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
  // The newest sign-in or verification code; with type: 'coupon', the
  // newest coupon or promo code, with its discount and valid-until date when
  // the email states them. Offers often come minutes later: give a longer
  // timeout (it repeats the request).
  waitForCode(address: string, options: WaitOptions & { type?: CodeType } = {}) {
    return this.wait(address, 'code', options, options.type && options.type !== 'otp' ? options.type : '');
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
    if (options.expectWithin !== undefined) extra.expect_within = String(options.expectWithin);
    let query = countQuery(options, extra);
    for (const phrase of options.expectText ?? []) query += `${query ? '&' : '?'}expect_text=${encodeURIComponent(phrase)}`;
    for (const pattern of options.expectAttachment ?? []) query += `${query ? '&' : '?'}expect_attachment=${encodeURIComponent(pattern)}`;
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

  // markUnsubscribed to offers below are Marketing and offer emails, in Labs:
  // the key's creator switches it on in Account settings → Labs. Until then
  // they throw a 403 that says so.

  // Records that the address unsubscribed from a sender, after the test did
  // it in its own browser (Proxy Mail QA never opens unsubscribe links). Any
  // later marketing email from that sender fails after_unsubscribe, however
  // long after. Name the sender with emailId or service (a name or domain);
  // with neither, the newest marketing email decides. at backdates it.
  // grace ('2h', '1d', or seconds; up to 30 days): marketing within it after
  // unsubscribing doesn't count, for mail already on its way.
  markUnsubscribed(address: string, options: { emailId?: string; service?: string; at?: Date | string; grace?: string | number } = {}) {
    return this.request<UnsubscribeWatch>('POST', `/addresses/${encodeURIComponent(address)}/unsubscribed`, {
      email_id: options.emailId,
      service: options.service,
      at: options.at instanceof Date ? options.at.toISOString() : options.at,
      grace: options.grace,
    });
  }

  // The address subscribed again: ends the watch for that sender (the only
  // one, when there's one).
  markResubscribed(address: string, options: { emailId?: string; service?: string } = {}) {
    const query = new URLSearchParams({ ...(options.service ? { service: options.service } : {}), ...(options.emailId ? { email_id: options.emailId } : {}) });
    return this.request<UnsubscribeWatch>('DELETE', `/addresses/${encodeURIComponent(address)}/unsubscribed${query.size ? `?${query}` : ''}`);
  }

  // Each unsubscribe and the marketing emails that came after it, by id and
  // how long after; passed is false when any came.
  checkUnsubscribe(address: string) {
    return this.request<UnsubscribeStatus>('GET', `/addresses/${encodeURIComponent(address)}/unsubscribed`);
  }

  // Records what the address agreed to at sign-up: marketing (opted_in or
  // declined), prechecked (the box was ticked when the form loaded) and
  // doubleOptIn (confirmed or pending). Only what's given changes. checkEmail
  // then judges marketing email by the rules where the persona lives.
  recordConsent(
    address: string,
    consent: { marketing?: 'opted_in' | 'declined' | null; prechecked?: boolean; doubleOptIn?: 'confirmed' | 'pending' | null; at?: Date | string },
  ) {
    return this.request<Consent>('PUT', `/addresses/${encodeURIComponent(address)}/consent`, {
      marketing: consent.marketing,
      prechecked: consent.prechecked,
      double_opt_in: consent.doubleOptIn,
      at: consent.at instanceof Date ? consent.at.toISOString() : consent.at,
    });
  }

  consent(address: string) {
    return this.request<Consent>('GET', `/addresses/${encodeURIComponent(address)}/consent`);
  }

  // After applying a coupon at checkout (on staging with test payments: never
  // real card details), records what the app did: accepted, rejected or an
  // error, with its message. The answer's check is the coupon_result verdict:
  // it fails a coupon accepted after its end date, for an offer already given
  // to another version of the address, or twice when oneTime.
  recordCouponResult(
    address: string,
    result: 'accepted' | 'rejected' | 'error',
    options: { code?: string; emailId?: string; message?: string; oneTime?: boolean; discountApplied?: string; at?: Date | string } = {},
  ) {
    return this.request<CouponResults>('POST', `/addresses/${encodeURIComponent(address)}/coupon-result`, {
      result,
      code: options.code,
      email_id: options.emailId,
      message: options.message,
      one_time: options.oneTime,
      discount_applied: options.discountApplied,
      at: options.at instanceof Date ? options.at.toISOString() : options.at,
    });
  }

  // Whether a welcome series or drip campaign came in order and on time after
  // since: each step answers pass, early, late, missing or waiting.
  checkSequence(address: string, steps: SequenceStep[], options: { since?: Date | string } = {}) {
    return this.request<SequenceResult>('POST', `/addresses/${encodeURIComponent(address)}/sequence`, {
      steps,
      since: options.since instanceof Date ? options.since.toISOString() : options.since,
    });
  }

  // Each sender's coupons and which version of the address each went to.
  // Mail to name+promo1@… and NAME@… reaches one inbox, so passed is false
  // when an offer reached two or more of them: one person got it twice.
  offers(address: string) {
    return this.request<Offers>('GET', `/addresses/${encodeURIComponent(address)}/offers`);
  }

  // What reached the address and what was refused, without waiting: for when
  // a wait comes back empty.
  checkDelivery(address: string) {
    return this.request<DeliveryStatus>('GET', `/addresses/${encodeURIComponent(address)}/delivery`);
  }

  variants(address: string) {
    return this.request<Variants>('GET', `/addresses/${encodeURIComponent(address)}/variants`);
  }

  // Awkward names for a name field: apostrophes, accents, other scripts,
  // very long ones, and HTML or SQL the app must store as text.
  nameVariants(options: { field?: NameField; maxLength?: number } = {}) {
    const query = new URLSearchParams();
    if (options.field) query.set('field', options.field);
    if (options.maxLength !== undefined) query.set('max_length', String(options.maxLength));
    const suffix = query.size ? `?${query}` : '';
    return this.request<NameVariants>('GET', `/variants/names${suffix}`);
  }

  // Awkward passwords within a field's rules: the minimum and maximum, each
  // symbol class, spaces and non-ASCII. Fresh each call.
  passwordVariants(options: { minLength?: number; maxLength?: number; symbols?: boolean } = {}) {
    const query = new URLSearchParams();
    if (options.minLength !== undefined) query.set('min_length', String(options.minLength));
    if (options.maxLength !== undefined) query.set('max_length', String(options.maxLength));
    if (options.symbols !== undefined) query.set('symbols', String(options.symbols));
    const suffix = query.size ? `?${query}` : '';
    return this.request<PasswordVariants>('GET', `/variants/passwords${suffix}`);
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
  // A test's result in the run (a failed one fails it), from a test runner's
  // reporter: proxymail-qa/playwright/reporter sends failed and flaky tests,
  // then the totals.
  recordTest(result: TestResultInput, run?: string) {
    const id = run ?? this.requireRun();
    return this.request<void>('POST', `/runs/${encodeURIComponent(id)}/tests`, {
      name: result.name,
      status: result.status,
      duration_ms: result.durationMs,
      error: result.error,
    });
  }

  // How the suite went, for the top of the run's report.
  recordTestTotals(totals: TestTotals, run?: string) {
    const id = run ?? this.requireRun();
    return this.request<void>('POST', `/runs/${encodeURIComponent(id)}/tests`, { totals });
  }

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
