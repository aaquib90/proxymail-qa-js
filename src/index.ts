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
  // What the group around it says, such as a fieldset's legend, or the
  // question a group of tick boxes answers. Send each tick box as a field.
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
  // A drop-down that takes several answers: <select multiple>, or a list the
  // page draws itself, such as a box of chips, sent as a combobox or text field
  // (send multiple: true on those too). Its answer comes back in values, and
  // only a custom field set to several options fills it.
  multiple?: boolean;
}

// Which fields nobody taught get a guess: every field, required fields only, or none.
export type FillUnknownFields = 'all' | 'required' | 'off';

export interface FormValuesOptions extends Omit<CreateAddressInput, 'password' | 'persona' | 'name'> {
  fields: FormFieldInput[];
  // Use this address, made earlier, instead of making a new one. For a
  // sign-up over several screens, call once per screen with the same address
  // and that screen's site and page. With address, a later screen of the
  // sign-up gets a password, date of birth or country only when the account
  // has none yet, and the account records site and environment when it has
  // none yet. A sign-in or password reset form sent without address is
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
  // A KYC vendor's sandbox values for this form (New in 0.13.0): a new
  // address takes its names and date of birth, and ID and business number
  // fields get its values (ID and tax number fields only where a ready-made
  // custom field fills them).
  kycSandbox?: KycVendor;
  // The result the test wants from the vendor's sandbox. Default: pass.
  kycOutcome?: KycOutcome;
}

export interface FormValue {
  id: string;
  kind:
    | 'email'
    | 'confirm_email'
    | 'first_name'
    | 'last_name'
    | 'full_name'
    // A name's reading (furigana) in a Japanese form: フリガナ, セイ, メイ.
    | 'last_name_reading'
    | 'first_name_reading'
    | 'full_name_reading'
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
    | 'guess'
    // A KYC vendor's sandbox value, because the call asked for kycSandbox:
    // only for that vendor's test mode.
    | 'sandbox';
  // What to type, or the option's value to pick. Null to leave it to you.
  value: string | null;
  // The custom field that decided it.
  rule?: { id: string; name: string };
  // A tick box: tick it or not.
  checked?: boolean;
  // A field sent with multiple: the value of each option to select. value is null.
  values?: string[];
  // A custom field's Leave it: the field stays as it is.
  leave?: boolean;
  // Where a guess came from.
  from?: 'placeholder' | 'option' | 'pattern' | 'words' | 'type';
  // A KYC sandbox value's catalogue section (getFormSection).
  section?: string;
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
  // Every one of these, for every account, 1 to 20: the tick boxes of a group
  // (boxes not listed are unticked, though a consent box, a marketing box or a
  // box with its own custom field is left as it is) or a drop-down that takes
  // several answers. Never a radio group.
  | { kind: 'options'; options: string[] }
  | { kind: 'checkbox'; checked: boolean }
  // Proxy Mail QA makes up a value that suits the field, the same one for the
  // same account. Any field but a checkbox, never a personal ID field.
  | { kind: 'generate' }
  // Leave the field as it is.
  | { kind: 'leave' }
  // New in 0.13.0: a ready-made custom field, Proxy Mail QA's own safe value
  // for every field of one kind, where it has one
  // (match { on: 'kind', text: section }).
  | ReadyMadeValue;

// The sections a ready-made custom field fills, as listFormSections names them.
export type ReadyMadeSection =
  | 'phone'
  | 'id.national'
  | 'id.tax'
  | 'id.passport'
  | 'business.vat'
  | 'business.tax'
  | 'gender'
  | 'referral_source'
  | 'language'
  | 'business.role'
  | 'business.team_size'
  | 'business.type'
  | 'consent.terms';
// A KYC vendor whose sandbox values a ready-made ID or tax number gives.
export type ReadyMadeIdsFrom = 'safe' | 'stripe' | 'plaid' | 'onfido' | 'veriff' | 'didit' | 'cashfree' | 'setu';

export interface ReadyMadeValue {
  kind: 'ready_made';
  section: ReadyMadeSection;
  // ID and tax numbers only: safe (the default), a fake value only where one
  // can never be a real person's, or a KYC vendor's sandbox values for its
  // test mode.
  ids_from?: ReadyMadeIdsFrom;
  // Phone number only: up to 20 test numbers your app accepts, one per
  // country (two-letter code), for accounts in countries with no numbers set
  // aside for fiction. Never a real person's number.
  phones?: Array<{ country: string; number: string }>;
  // The terms box only: ticked (the default) or not.
  checked?: boolean;
}

export interface CustomFieldInput {
  // Changes this one; the same match and place as another changes that one too.
  id?: string;
  name: string;
  // test_id and html_id match exactly, name the field's name, and words the
  // words of its label, placeholder or name. A words match can add up to 9
  // more phrases in also, such as its label in the site's other languages.
  // Saving replaces the custom field, so send every phrase to keep. kind (new
  // in 0.13.0) is a ready-made custom field's, text its section: its match and
  // section stay as saved. Only a lead's key adds or changes an ID or tax
  // number one, or the phone number's test numbers.
  match: { on: 'words' | 'name' | 'html_id' | 'test_id' | 'kind'; text: string; also?: string[] };
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
  // false when fills ignore it, as if it weren't there. It's still listed.
  enabled: boolean;
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
    | 'save_custom_field'
    | 'delete_custom_field'
    | 'add_site'
    | 'remove_site'
    | 'set_guesses'
    | 'set_multi_step'
    | 'save_signup_screen'
    | 'remove_signup_screen'
    | 'set_custom_field_enabled'
    | 'set_standard_field'
    | 'save_signup_form';
  target_id: string | null;
  // The custom field's name, the site, the screen, or the setting's new choice.
  summary: string;
  change: Record<string, unknown>;
  note: string | null;
  status: 'requested' | 'approved' | 'declined' | 'withdrawn' | 'expired' | 'unlocked';
  // A lead's reason for declining.
  reason: string | null;
}

// The standard fields with a switch. When one's off, its box is left empty.
export type StandardFieldName = 'company' | 'first_name' | 'last_name' | 'full_name';
export type StandardFieldSet = { status: 'saved'; standard_fields_off: StandardFieldName[] } | { status: 'requested'; request: ChangeRequest };

export interface CustomFields {
  // The project's guesses setting.
  guesses: FillUnknownFields;
  // The standard fields turned off: each box is left empty, unless a custom
  // field that's on fills it.
  standard_fields_off?: StandardFieldName[];
  // True when the five ID and tax number ready-made custom fields are all
  // there, for every site, and on.
  fill_id_fields?: boolean;
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

// New in 0.13.0: sign-up forms (signupForms, signupForm, saveSignupForm,
// deleteSignupForm, signupFormCode), a form as a spec: its screens, and on
// each the fields from the field catalogue (listFormSections) in order. Saving makes the
// custom fields the form needs, only for fields the built-in fill doesn't
// cover, each matched by its test id.
export interface SignupFormFieldInput {
  // A section id from listFormSections, such as email or business.team_size;
  // or custom, with customField, for a question the project's own custom field answers.
  section: string;
  // Section custom only: the custom field that fills it, by its id from
  // listCustomFields. It keeps deciding the value; give the field the test id
  // or label that custom field looks for.
  custom_field?: string;
  // Defaults to true.
  required?: boolean;
  // Defaults to the section's label in the form's language.
  label?: string;
  // Its data-testid; defaults to signup- and the section id with dashes.
  testid?: string;
  options?: {
    country?: string;
    min_length?: number;
    max_length?: number;
    classes?: Array<'lower' | 'upper' | 'digit' | 'symbol'>;
    min_age?: number;
    choices?: string[];
    // Section custom only: a text box, a drop-down (with choices) or a tick box.
    type?: 'text' | 'select' | 'checkbox';
  };
}

export interface SignupFormSpecInput {
  version?: 1;
  name: string;
  // The site it's on, as the project lists it. Leave out to match on every site.
  site?: string;
  // en (the default), de, fr, es, it, pt, nl, zh or ja.
  language?: string;
  // For country-dependent fields: IDs, VAT numbers, phones, addresses.
  country?: string;
  screens: Array<{ title?: string; path?: string; screen_id?: string; fields: SignupFormFieldInput[] }>;
}

// A spec as saved, with every default filled in.
export interface SignupFormSpec {
  version: 1;
  name: string;
  site: string | null;
  language: string;
  country: string | null;
  screens: Array<{
    title: string | null;
    path: string | null;
    screen_id: string | null;
    fields: Array<Required<Omit<SignupFormFieldInput, 'options' | 'custom_field'>> & { custom_field?: string; options: NonNullable<SignupFormFieldInput['options']> }>;
  }>;
}

// requested: a lead hasn't answered yet; draft: asked for and never approved.
export type SignupFormStatus = 'saved' | 'requested' | 'draft';

export interface SignupFormSummary {
  id: string;
  name: string;
  status: SignupFormStatus;
  site: string | null;
  screens: number;
  fields: number;
  created_via: 'app' | 'extension' | 'agent' | 'api';
  agent_name: string | null;
  created_at: string;
  updated_at: string;
}

// A custom field a sign-up form needs, as the API gives it: matched by the
// field's test id, on the form's site and page when it names a site.
export interface SignupFormCustomField {
  name: string;
  match: { on: 'test_id'; text: string };
  site?: string;
  path?: string;
  field_type: 'select' | 'checkbox' | 'text';
  value: CustomFieldValue;
}

export interface SignupForm extends SignupFormSummary {
  spec: SignupFormSpec;
  // The custom fields the form needs.
  custom_fields: SignupFormCustomField[];
  // How each field gets its value: the built-in fill, one of the form's
  // custom fields (a ready-made one for a phone, an ID or tax number, a
  // choice or the terms box), or never (left for the test).
  fills: Array<{ testid: string; section: string; fill: 'built_in' | 'custom_field' | 'never' }>;
  // While a lead hasn't answered: what was asked, and the request.
  requested?: { name: string; spec: SignupFormSpec; custom_fields: SignupFormCustomField[] };
  request?: ChangeRequest;
}

export interface SignupForms {
  locked: boolean;
  you_lead: boolean;
  forms: SignupFormSummary[];
}

// What fills each field a custom field fills, and what's left for the person
// to decide (17 Nov 2026). made: the save makes a ready-made custom field;
// form: a ready-made field a form made; yours: the project's own.
export interface SignupFormFillPlan {
  // named: a field with section custom; finds: whether its custom field finds it on the page.
  fields_filled_by: Array<{
    testid: string;
    label: string;
    filled_by: 'made' | 'form' | 'yours' | 'none';
    custom_field?: { id: string; name: string };
    named?: true;
    finds?: boolean;
  }>;
  // The project's own custom field also fills the field, but the form's wins:
  // ask the person, then save again with choices.
  clashes: Array<{ testid: string; label: string; yours: { id: string; name: string }; form: { id: string; name: string } }>;
  // Custom fields the form made and no longer uses: ask the person, then save again with tidy.
  leftovers: Array<{ custom_field: { id: string; name: string }; testid: string; reason: 'gone' | 'renamed' | 'yours'; to?: string }>;
  tidied?: { custom_fields_removed: string[]; custom_fields_moved: string[]; custom_fields_asked: string[]; custom_fields_kept: string[] };
}
export type SignupFormSaved = ({ status: 'saved'; form: SignupForm } | { status: 'requested'; form: SignupForm; request: ChangeRequest }) & SignupFormFillPlan;
// choices: by a field's test id, 'yours' keeps the project's own custom field
// on a clash, 'form' the form's. tidy: what to do with leftovers.
export interface SaveSignupFormOptions {
  choices?: Record<string, 'yours' | 'form'>;
  tidy?: { remove?: string[]; move?: Array<{ id: string; testid: string }> };
}

// A sign-up form as code (New in 0.13.0): React with react-hook-form and zod,
// React with plain state, or one HTML page.
export type SignupCodeFormat = 'react-hook-form' | 'react' | 'html';

export interface SignupFormCode {
  form: { id: string; name: string; status: 'saved' | 'requested' | 'draft' };
  format: SignupCodeFormat;
  files: Array<{ path: string; contents: string }>;
  // The npm packages the code imports.
  dependencies: string[];
  // What to know before putting it in, such as answers to set.
  notes: string[];
}

// A starter to build a sign-up form from (New in 0.13.0).
export type SignupStarterId = 'b2c' | 'b2b' | 'education' | 'marketplace' | 'travel' | 'fintech' | 'japan' | 'china';

export interface SignupStarter {
  id: SignupStarterId;
  // The plan's row, such as FM-26.
  item: string;
  name: string;
  description: string;
  // What to know when building from it.
  notes: string[];
  spec: SignupFormSpec;
}

// Tests for a sign-up form (New in 0.13.0): Playwright or Cypress.
export type SignupTestFramework = 'playwright' | 'cypress';

export interface SignupFormTest {
  form: SignupFormCode['form'];
  framework: SignupTestFramework;
  files: Array<{ path: string; contents: string }>;
  // The npm packages the tests import.
  dependencies: string[];
  // How many values each kind of test tries.
  counts: { refuse: number; take: number };
  // What to know before running them, such as a value to put in.
  notes: string[];
}

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

// listed: the site was on the list already, and is left as it is.
export type SiteAdded = { status: 'saved' | 'listed'; site: ProjectSite } | { status: 'requested'; request: ChangeRequest };
export type MultiStepSet = { status: 'saved'; site: ProjectSite } | { status: 'requested'; request: ChangeRequest };
export type SignupScreenSaved = { status: 'kept'; screen: SignupScreen } | { status: 'requested'; screen: SignupScreen; request: ChangeRequest };
export type SignupScreenRemoved = { status: 'removed'; id: string } | { status: 'requested'; request: ChangeRequest };

// The key's project, as project() and updateProject() return it.
export type ProjectInfo = Record<string, unknown> & {
  addresses?: AddressAllowance;
  fill_unknown_fields?: FillUnknownFields;
  // The standard fields turned off (setStandardField).
  standard_fields_off?: StandardFieldName[];
  // New in 0.13.0: true when the five ID and tax number ready-made custom
  // fields are all there, for every site, and on.
  fill_id_fields?: boolean;
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
  // With kycSandbox: all of the vendor's values for the outcome, its phone,
  // email and address ones included, to type where the test needs them.
  kyc_sandbox?: KycSandbox;
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
  // Whether the verify, sign-in, invite or reset link (for a code, the
  // email's own links) goes back to the site the test started on: expectSite,
  // or the site the address was created with. Missing without a site.
  link_site?: LinkSite;
  // After markSubmitted: how long it took after the form was sent.
  time_to_email?: TimeToEmail;
}

export type SubmitFlow = 'sign_up' | 'sign_in' | 'reset' | 'magic_link' | 'other';

// A submit as markSubmitted recorded it; submitted_at is the server's time.
export interface Submit {
  id: string;
  address: string;
  flow: SubmitFlow;
  site: string | null;
  submitted_at: string;
}

// How long the email took after the form was sent, by the server's clock.
export interface TimeToEmail {
  submitted_at: string;
  flow: SubmitFlow;
  site: string | null;
  source: 'extension' | 'agent';
  after_seconds: number;
  // The app and its email provider, and Proxy Mail QA, split at Cloudflare's
  // mail server; null when the Received header couldn't be read.
  their_seconds: number | null;
  our_seconds: number | null;
  // 2 or more: one submit brought several codes or links.
  emails_for_submit: number;
  position: number;
  // A wait had already found nothing when it came.
  after_wait_gave_up: boolean;
  // The site's and flow's last 30 days in this project.
  usual: {
    submits: number;
    arrived: number;
    nothing: number;
    median_seconds: number | null;
    today_median_seconds: number | null;
    slowest_seconds: number | null;
    slower_than_usual: boolean;
  };
}

export type LinkSiteProblem = 'local' | 'other_site' | 'preview' | 'published' | 'http' | 'bubble_live' | 'bubble_test';

export interface LinkSite {
  status: 'pass' | 'fail';
  // When it fails: localhost from a hosted site, another site, the preview or
  // the published app instead of the other, plain http, or Bubble's live app
  // instead of version-test (bubble_live) or the other way (bubble_test).
  problem?: LinkSiteProblem;
  // What it was compared with, and where the link ends up, as host (and
  // Bubble version): never the link's path or query.
  site: string;
  goes_to: string | null;
  detail: string;
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
  // A persona with one name and no family name (last_name null), as many
  // people in India and Indonesia have. formValues then leaves a last name
  // field empty with a note.
  oneName?: boolean;
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
  // Where the account is used: a host or page URL, kept as its host, and the
  // environment, such as staging. null clears either.
  site?: string | null;
  environment?: string | null;
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
  // New in 0.13.0: when the last email came from a platform's built-in sender.
  shared_sender?: SharedSender;
  help: string;
}

// New in 0.13.0: a platform's built-in sender (Supabase's, Firebase's,
// Bubble's…) rather than the app's own email provider, with its cap and fix.
export interface SharedSender {
  platform: 'supabase' | 'firebase' | 'bubble' | 'glide' | 'base44' | 'cognito' | 'auth0';
  name: string;
  cap: string | null;
  fix: string;
  docs: string;
}

// New in 0.13.0: which case a wait that found nothing is. nothing_arrived:
// nothing reached Proxy Mail QA (not sent, held by a sandbox or over a cap);
// no_match: email arrived, so the app is sending, but none matched.
// arrived_before_since, new in the next release (0.13.0 passes the value on,
// but its type lacks it): an unused one came shortly before since, up to 2
// minutes before it or before now when since is ahead of Proxy Mail QA's
// clock. So since was probably set after the form was sent, or is ahead (the
// hint says when).
export type NothingArrivedCase = 'nothing_arrived' | 'no_match' | 'turned_away' | 'already_used' | 'arrived_before_since';

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
  // The site the test started on, for link_site: staging.example.com,
  // localhost:3000 or myapp.bubbleapps.io/version-test. Default: the site
  // the address was created with.
  expectSite?: string;
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
  | 'shared_sender'
  | 'local_links'
  | 'plain_http'
  | 'expected_host'
  | 'link_site'
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
  | 'ad_label'
  // Good practice, as warnings (Journeys, in Labs).
  | 'code_length'
  | 'link_length'
  | 'auth_length'
  | 'subject_length'
  | 'one_action';

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

// The checks to run on a sign-up, password reset or magic-link flow, beyond
// "the email arrived". Your test runs them through the app.
export type Flow = 'sign_up' | 'password_reset' | 'magic_link';

export interface FlowCheck {
  // A stable name, such as code_works_once.
  id: string;
  checks: string;
  // Only when the check can't always run: what it needs, and when to skip it.
  needs?: string;
  steps: string[];
  expect: string;
  why: string;
}

// New in 0.13.0: the field catalogue (listFormSections, getFormSection), the
// sections a sign-up form may ask for and, for IDs and tax numbers by country,
// a format rule and a fake value only where one can never be a real person's.
// Check a value with followsFormat, which runs here: never send a real ID
// anywhere.
export type FormSectionGroup = 'person' | 'account' | 'business' | 'documents';
// A: a published test value. B: a shape that's never issued. rule_only: the
// rule and any reject variants, but no value. not_offered: nothing (Korea's RRN).
export type FormSectionTier = 'A' | 'B' | 'rule_only' | 'not_offered';

export interface FormSectionSummary {
  id: string;
  group: FormSectionGroup;
  name: string;
  source: 'persona' | 'generated' | 'choice' | 'id' | 'never';
  labels: Record<string, string[]>;
  note: string;
  formats?: Array<{ country: string; name: string; shape: string; tier: FormSectionTier; tier_name: string }>;
  // A section a ready-made custom field covers: the options its value takes,
  // and whether only the project's leads add or change it.
  ready_made?: { options: Array<'ids_from' | 'phones' | 'checked'>; leads_only: boolean; note: string };
}

export interface FormSection extends FormSectionSummary {
  country: string | null;
  format?: {
    name: string;
    shape: string;
    pattern: string;
    check: FormatCheck | null;
    check_name: string | null;
    tier: FormSectionTier;
    tier_name: string;
    note: string;
  };
  value?: {
    // As people write it; null when none is given (see the note).
    value: string | null;
    compact: string | null;
    // Every account gets the same value.
    shared: boolean;
    // A form that checks the issuer's rules more strictly refuses it.
    fails_strict_checks: boolean;
    // This account's own, where value is shared.
    unique?: string;
    source?: string;
    url?: string;
    // A published specimen to try as well, shared by every account.
    specimen?: { value: string; source: string; url?: string };
  };
  // A passport value's expiry, holder and machine-readable lines (MRZ). The
  // holder is the account's own when address is one of yours.
  passport?: {
    issuing_state: string;
    expiry: string;
    holder: { surname: string; given_names: string; date_of_birth: string; from: 'address' | 'made_up' };
    mrz: [string, string];
  };
  variants?: { accept: FieldVariant[]; reject: FieldVariant[] };
  says?: string;
  // With kycSandbox: that vendor's sandbox values for the section.
  kyc_sandbox?: KycSandbox;
}

// KYC sandbox mode (New in 0.13.0): a KYC vendor's published sandbox values,
// for an app that checks identities with it. They're the vendor's values,
// from its docs, for its test mode only.
export type KycVendor = 'stripe' | 'plaid' | 'onfido' | 'veriff' | 'didit' | 'cashfree' | 'setu';
export type KycOutcome = 'pass' | 'fail' | 'review';

export interface KycSandbox {
  vendor: KycVendor;
  name: string;
  product: string;
  outcome: KycOutcome;
  // "sandbox value from Stripe": say so wherever a value is shown.
  label: string;
  url: string;
  note: string;
  values: Array<{ section: string | null; field: string; value: string; outcome: KycOutcome; gives: string; needs?: string; country?: string; url: string }>;
  says: string;
}

export type FormatCheck = 'verhoeff' | 'cpf' | 'cnpj' | 'gb11643' | 'my_number' | 'abn' | 'gb_vat' | 'icao';

// New in 0.13.0: the clean-up list (cleanupList), every test address the
// project used in a time range, live or gone, to delete those test users
// from your app. Proxy Mail QA never touches your app.
export interface CleanupList {
  from: string;
  to: string;
  // The earliest from can be: 90 days ago.
  kept_from: string;
  count: number;
  // More than 5,000 matched: narrow the range or give site.
  truncated: boolean;
  // The domains every test address ends in, to filter your users by.
  mail_domains: string[];
  addresses: Array<{
    address: string;
    created_at: string;
    status: 'live' | 'expired' | 'deleted';
    ended_at?: string;
    site?: string;
    environment?: string;
    // Whether any email reached it: if so, your app very likely has a user for it.
    had_email: boolean;
  }>;
}

export interface CleanupListOptions {
  // Addresses still live, or ended, on or after then (default 30 days ago; it can't go back past 90 days).
  from?: Date | string;
  // Addresses made on or before then (default now).
  to?: Date | string;
  // Only addresses used on this site, such as staging.example.com.
  site?: string;
}

export interface FlowChecks {
  flow: Flow;
  checks: FlowCheck[];
}

// New in 0.14.0, with the Journeys Lab: a site's journey (journey), as the
// Journeys page draws it. Steps are named by kind, sender and key, never by
// subject. Labels, tags and sender names come from your project's members and
// from whoever sent the mail.
export type JourneyPhase = 'after_signup' | 'signing_in' | 'password_reset' | 'invites' | 'ongoing';
export type JourneyAgeBand = 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55-plus';

export interface JourneyOptions {
  // The journey: a site's host, or sender:<domain> for accounts with no site (default: the first listed).
  site?: string;
  // Only this phase's steps; the sentence and the counts stay whole.
  phase?: JourneyPhase;
  // Accounts in any of these countries (ISO 3166-1 alpha-2).
  country?: string[];
  // Accounts with no country.
  countryUnknown?: boolean;
  // Accounts in any of these age bands, by their age today.
  age?: JourneyAgeBand[];
  // Accounts with no date of birth.
  ageUnknown?: boolean;
  // Accounts with any one of these tags.
  anyTags?: string[];
  // One account's own journey: the other filters are then ignored.
  address?: string;
  // Accounts that got every one of these steps, by key.
  gotStep?: string[];
  // Accounts that got none of these steps, by key.
  notGotStep?: string[];
}

export interface JourneyStepOut {
  type: 'step';
  key: string;
  kind: string;
  kind_name: string;
  sender: string;
  got: number;
  // Accounts it is counted out of; null for a section's first step outside After sign-up.
  of: number | null;
  // One account's wait, the middle of two, or the median of three or more.
  wait: { ms: number; kind: 'one' | 'two' | 'usual' | null; all_ms: number[]; range_ms?: [number, number]; from: string } | null;
  countries: Record<string, number>;
  age_bands: Record<string, number>;
  still_due: { addresses: string[]; left_out: number; usually_after_ms: number | null };
  // null where it can't be said: the 5,000-email limit cut mail, or nobody has to ask for this step.
  did_not_get: { addresses: string[]; left_out: number } | null;
  warnings: Array<{ id: string; text: string }>;
  emails: Array<{ id: string; address: string; received_at: string }>;
  emails_left_out?: number;
}

// A split path's filter: the journey and filter that show the path alone, with
// get_journey's names. journey() takes it as it is: qa.journey(path.filter).
export interface JourneyPathFilter {
  site: string;
  country?: string[];
  country_unknown?: boolean;
  age?: JourneyAgeBand[];
  age_unknown?: boolean;
  any_tags?: string[];
  address?: string;
  got_step?: string[];
  not_got_step?: string[];
}

export interface JourneySplit {
  type: 'split';
  by: 'country' | 'age band' | 'tag';
  // query: the same as filter, as GET /v1/journeys' query string.
  paths: Array<{ label: string; accounts: number; filter: JourneyPathFilter; query: string; steps: JourneyStepOut[] }>;
}

export interface Journey {
  // The page's sentence, with a step in it named by kind, sender and key:
  // "Showing 2 of 7 test accounts on staging.example.com: Country: DE."
  showing: string;
  notes: string[];
  // Opens the Journeys page on this view.
  link: string;
  journey: string;
  name: string;
  by: 'site' | 'sender';
  journeys: Array<{ journey: string; name: string; by: 'site' | 'sender'; accounts: number }>;
  accounts: { shown: number; total: number; with_no_email: number };
  emails: number;
  // The 5,000-email limit left the oldest mail out, so did_not_get is null.
  truncated: boolean;
  filters_left_off: number;
  // Accounts with no country or no date of birth are under country_unknown and
  // age_unknown (countryUnknown and ageUnknown ask for them), only while there are some.
  filter_values: Record<'country' | 'age' | 'tags', Array<{ value: string; accounts: number; chosen?: boolean }>> &
    Partial<Record<'country_unknown' | 'age_unknown', { accounts: number; chosen?: boolean }>>;
  phases: Array<{ phase: JourneyPhase; name: string; started_by: string; steps: Array<JourneyStepOut | JourneySplit> }>;
  good_practice: Array<{ rule: string; name: string; checked: number; warned: number }>;
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
  // The site the test started on, for the link_site check. Default: the
  // site the address was created with; without either, it's skipped.
  expectSite?: string;
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
// mail it turned away; both are in the message too. From 0.13.0, why says
// which case it is and sharedSender names a platform's built-in sender.
export class ProxyMailQAError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly refused?: Refusal[],
    readonly help?: string,
    readonly why?: NothingArrivedCase,
    readonly sharedSender?: SharedSender,
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
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      hint?: string;
      refused?: Refusal[];
      help?: string;
      why?: NothingArrivedCase;
      shared_sender?: SharedSender;
    };
    if (!response.ok) {
      throw new ProxyMailQAError(
        response.status,
        payload.error ?? 'error',
        payload.message ?? `Request failed with ${response.status}`,
        payload.hint,
        payload.refused,
        payload.help,
        payload.why,
        payload.shared_sender,
      );
    }
    return payload as T;
  }

  // The key's project: its mail domains, prefix and limits. addresses says
  // how many its space has used and may still create (Free: 500 in total and
  // 50 a day; Team: no limit, so limit is null). Past the 500, createAddress
  // throws ProxyMailQAError with status 402 and code plan_required; past the
  // day's 50, status 429 and code daily_limit, until midnight UTC.
  // From 0.12.0 it also has fill_unknown_fields, standard_fields_off, locked,
  // custom_fields (how many) and multi_step_sites.
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
  // person asks; for one call, pass guess to formValues. fillIdFields (new in
  // 0.13.0) true adds the five ID and tax number ready-made custom fields, or
  // turns on those there, and false turns them off: a lead's key only, and
  // only when the person asks.
  updateProject(patch: {
    name?: string;
    website?: string | null;
    environments?: string[];
    emailPrefix?: string | null;
    mailDomain?: string;
    fillUnknownFields?: FillUnknownFields;
    fillIdFields?: boolean;
  }) {
    const { emailPrefix, mailDomain, fillUnknownFields, fillIdFields, ...rest } = patch;
    return this.request<ProjectInfo>('PATCH', '/project', {
      ...rest,
      ...(emailPrefix !== undefined ? { email_prefix: emailPrefix } : {}),
      ...(mailDomain !== undefined ? { mail_domain: mailDomain } : {}),
      ...(fillUnknownFields !== undefined ? { fill_unknown_fields: fillUnknownFields } : {}),
      ...(fillIdFields !== undefined ? { fill_id_fields: fillIdFields } : {}),
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

  // Turns a custom field on or off, or asks the leads to (status 'requested'),
  // as saveCustomField. When it's off, fills ignore it, as if it weren't there;
  // to keep a field empty, give a custom field the value leave instead.
  setCustomFieldEnabled(id: string, on: boolean) {
    return this.request<CustomFieldSaved>('PATCH', '/project/custom-fields', { id, enabled: on });
  }

  // Turns Company, First name, Last name or Full name on or off, or asks the
  // leads to (status 'requested'), as saveCustomField. When it's off, that box
  // is left empty, with no guess; a custom field that's on still fills it.
  setStandardField(field: StandardFieldName, on: boolean) {
    return this.request<StandardFieldSet>('PATCH', '/project/standard-fields', { field, on });
  }

  // The project's sign-up forms, newest change first (New in 0.13.0).
  signupForms() {
    return this.request<SignupForms>('GET', '/project/signup-forms');
  }

  // One sign-up form in full: its spec, the custom fields it needs and how
  // each field gets its value (New in 0.13.0).
  signupForm(id: string) {
    return this.request<SignupForm>('GET', `/project/signup-forms/${encodeURIComponent(id)}`);
  }

  // Saves a sign-up form: a new one, the one with this id, or the one with the
  // same name (New in 0.13.0). It uses a custom field that already fills a
  // field and makes ready-made ones only where nothing does; the answer says
  // what fills each, any clashes and any leftovers, for options.choices and
  // options.tidy on a second save once the person says. Save one only when
  // the person asks. On a project where only leads change custom fields and
  // your key's creator isn't one, it's one request to the leads instead
  // (status 'requested'), and the form waits as a draft.
  saveSignupForm(spec: SignupFormSpecInput, id?: string, options: SaveSignupFormOptions = {}) {
    return this.request<SignupFormSaved>('POST', '/project/signup-forms', {
      spec,
      ...(id ? { id } : {}),
      ...(options.choices ? { choices: options.choices } : {}),
      ...(options.tidy ? { tidy: options.tidy } : {}),
    });
  }

  // Removes a sign-up form: whoever made it or a lead (New in 0.13.0). Its
  // custom fields stay, unless removeCustomFields: then they go too, except
  // any another form still uses, and the answer names those removed and kept.
  deleteSignupForm(id: string, options: { removeCustomFields?: boolean } = {}) {
    const query = options.removeCustomFields ? '?remove_custom_fields=true' : '';
    return this.request<{ status: 'removed'; id: string; custom_fields_removed: string[]; custom_fields_asked: string[]; custom_fields_kept: string[] }>(
      'DELETE',
      `/project/signup-forms/${encodeURIComponent(id)}${query}`,
    );
  }

  // A sign-up form as code to put in your app (New in 0.13.0): each field
  // checks what the spec asks for, with messages in the form's language and
  // the data-testid its custom fields match. format defaults to
  // 'react-hook-form'; requested: true gives the change waiting for a lead.
  signupFormCode(id: string, options: { format?: SignupCodeFormat; requested?: boolean } = {}) {
    const query = new URLSearchParams();
    if (options.format) query.set('format', options.format);
    if (options.requested) query.set('requested', 'true');
    const search = query.toString();
    return this.request<SignupFormCode>('GET', `/project/signup-forms/${encodeURIComponent(id)}/code${search ? `?${search}` : ''}`);
  }

  // Tests for a sign-up form (New in 0.13.0): each field gets values the form
  // should take and ones it should refuse, with every other field filled in
  // from a new test address. framework defaults to 'playwright';
  // requested: true gives the change waiting for a lead.
  signupFormTest(id: string, options: { framework?: SignupTestFramework; requested?: boolean } = {}) {
    const query = new URLSearchParams();
    if (options.framework) query.set('framework', options.framework);
    if (options.requested) query.set('requested', 'true');
    const search = query.toString();
    return this.request<SignupFormTest>('GET', `/project/signup-forms/${encodeURIComponent(id)}/test${search ? `?${search}` : ''}`);
  }

  // The project's sites, each with whether Proxy Mail QA for Chrome 0.9.0 and
  // later fills each screen of its sign-up by itself (multi_step) and its
  // sign-up screens, the native app's screens with no site, and your key's
  // waiting requests about sites.
  sites() {
    return this.request<Sites>('GET', '/project/sites');
  }

  // Adds a site to the project's list: a host or a page's address on it, such
  // as staging.example.com or localhost:3000, with its environment. Only a
  // host that doesn't look live (a local server, or a host with a test word
  // in it such as staging, dev or qa, never the environment production): a
  // live-looking one is refused (403) with a link for a person to add it in
  // the app, where they confirm it's a test site. No *. On a project where
  // only leads change sites and your key's creator isn't one, it's a request
  // to the leads instead: status 'requested'. Chrome's access to the site is
  // still each person's to give, from the extension's popup.
  addSite(site: string, environment: string) {
    return this.request<SiteAdded>('POST', '/project/sites', { site, environment });
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
      one_name: input.oneName,
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
        multiple: f.multiple,
      })),
      address: options.address,
      page: options.page,
      screen: options.screen,
      guess: options.guess,
      kyc_sandbox: options.kycSandbox,
      kyc_outcome: options.kycOutcome,
      label: options.label,
      lifetime_days: options.lifetimeDays,
      domain: options.domain,
      age: options.age,
      date_of_birth: options.dateOfBirth,
      country: options.country,
      one_name: options.oneName,
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
  // An authenticator app's code (TOTP, RFC 6238) for a test account with
  // two-factor sign-in, worked out on this machine from the secret the app
  // showed at set-up (its base32 key, or the otpauth:// address in its QR
  // code). The secret never reaches Proxy Mail QA. The same as the
  // totpCode function; here so a test with a client needs no other import.
  totpCode(secret: string, options: TotpOptions = {}) {
    return totpCode(secret, options);
  }

  // Starters to build a sign-up form from (New in 0.13.0): every one, or one
  // by id, in a language or for a country. Save your version with
  // saveSignupForm.
  signupStarters(options: { id?: SignupStarterId; language?: string; country?: string } = {}) {
    const q = new URLSearchParams();
    if (options.id) q.set('id', options.id);
    if (options.language) q.set('language', options.language);
    if (options.country) q.set('country', options.country);
    const query = q.toString();
    return this.request<{ starters: SignupStarter[] }>('GET', `/signup-starters${query ? `?${query}` : ''}`);
  }

  // The field sections a sign-up form may ask for, by group, with the
  // countries each ID or tax number has formats for (New in 0.13.0).
  // kycSandbox adds that KYC vendor's sandbox values for kycOutcome.
  listFormSections(options: { country?: string; group?: FormSectionGroup; kycSandbox?: KycVendor; kycOutcome?: KycOutcome } = {}) {
    const q = new URLSearchParams();
    if (options.country) q.set('country', options.country);
    if (options.group) q.set('group', options.group);
    if (options.kycSandbox) q.set('kyc_sandbox', options.kycSandbox);
    if (options.kycOutcome) q.set('kyc_outcome', options.kycOutcome);
    const query = q.toString();
    return this.request<{ country: string | null; group: FormSectionGroup | null; sections: FormSectionSummary[]; kyc_sandbox?: KycSandbox }>(
      'GET',
      `/form-sections${query ? `?${query}` : ''}`,
    );
  }

  // One section: for an ID or tax number, its format in a country, a fake
  // value that follows it, given only where one can never be a real person's, and
  // variants. Give address to keep the value the same for that test account
  // (New in 0.13.0).
  getFormSection(id: string, options: { country?: string; address?: string; kycSandbox?: KycVendor; kycOutcome?: KycOutcome } = {}) {
    const q = new URLSearchParams();
    if (options.country) q.set('country', options.country);
    if (options.address) q.set('address', options.address);
    if (options.kycSandbox) q.set('kyc_sandbox', options.kycSandbox);
    if (options.kycOutcome) q.set('kyc_outcome', options.kycOutcome);
    const query = q.toString();
    return this.request<FormSection>('GET', `/form-sections/${encodeURIComponent(id)}${query ? `?${query}` : ''}`);
  }

  // Whether a value follows a format from getFormSection, worked out here;
  // the same as the followsFormat function (New in 0.13.0).
  followsFormat(format: { pattern: string; check: FormatCheck | null }, value: string) {
    return followsFormat(format, value);
  }

  // The test addresses this project used between from and to, to delete
  // those test users from your app afterwards (New in 0.13.0).
  cleanupList(options: CleanupListOptions = {}) {
    const q = new URLSearchParams();
    const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
    if (options.from !== undefined) q.set('from', iso(options.from));
    if (options.to !== undefined) q.set('to', iso(options.to));
    if (options.site) q.set('site', options.site);
    const query = q.toString();
    return this.request<CleanupList>('GET', `/cleanup-list${query ? `?${query}` : ''}`);
  }

  // A site's journey, as the Journeys page draws it, for all the project's
  // test accounts or the ones the options pick (Journeys Lab; new in 0.14.0).
  // A split path's filter works as the options too.
  journey(options: JourneyOptions | JourneyPathFilter = {}) {
    const o = options as JourneyOptions & Partial<JourneyPathFilter>;
    const q = new URLSearchParams();
    // A comma inside a value is written %2C, as the page's address writes it.
    const list = (items?: readonly string[]) => (items?.length ? items.map((item) => item.replace(/%/g, '%25').replace(/,/g, '%2C')).join(',') : null);
    const put = (name: string, value: string | null | undefined) => {
      if (value) q.set(name, value);
    };
    put('site', o.site);
    put('phase', o.phase);
    put('country', list(o.country));
    put('country_unknown', o.countryUnknown || o.country_unknown ? '1' : null);
    put('age', list(o.age));
    put('age_unknown', o.ageUnknown || o.age_unknown ? '1' : null);
    put('any_tags', list(o.anyTags ?? o.any_tags));
    put('address', o.address);
    put('got_step', list(o.gotStep ?? o.got_step));
    put('not_got_step', list(o.notGotStep ?? o.not_got_step));
    const query = q.toString();
    return this.request<Journey>('GET', `/journeys${query ? `?${query}` : ''}`);
  }

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

  // Records that the test is about to submit a form with the address (a
  // sign-up unless flow says otherwise), on site (a page URL, kept as host and
  // path, with any part of the path that has an email address, an ID, a long
  // number or a token in it hidden; never its query or fragment). Call it just
  // before the test presses the button: the time is the server's, taken when
  // the call arrives, so after the click a fast email can come first. Pass its
  // submitted_at as since; the wait that finds the code or link then returns
  // time_to_email. Never send the form's contents.
  markSubmitted(address: string, options: { flow?: SubmitFlow; site?: string } = {}) {
    return this.request<Submit>('POST', `/addresses/${encodeURIComponent(address)}/submits`, { flow: options.flow, site: options.site });
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
  // localhost or plain http, where its link goes (expectHost) and whether
  // it goes back to the site the test started on (link_site), a stated
  // expiry, a plain-text part, size and image-only emails, and given phrases
  // (expectText) and its language (expectLanguage). Doesn't wait: wait for
  // the email first. Throws ProxyMailQAError (404) when none matches.
  checkEmail(address: string, options: CheckOptions = {}) {
    const extra: Record<string, string> = {};
    if (options.emailId) extra.email_id = options.emailId;
    if (options.expectHost) extra.expect_host = options.expectHost;
    if (options.expectSite) extra.expect_site = options.expectSite;
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

  // The checks to run on a sign-up, password reset or magic-link flow: a
  // code working once, only the newest reset link working, a second person
  // unable to see the first one's data. Each has steps, what to expect and why.
  flowChecks(flow: Flow) {
    return this.request<FlowChecks>('GET', `/flow-checks?flow=${encodeURIComponent(flow)}`);
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
      if (options.expectSite) query.set('expect_site', options.expectSite);
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

// Two-factor codes (FM-3): an authenticator app's six-digit code, worked out
// here, so the secret never leaves the tester's machine. RFC 6238 (TOTP) over
// RFC 4226 (HOTP); checked against RFC 6238's own test values.
export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface TotpOptions {
  // 6 unless the app says otherwise (an otpauth:// address can).
  digits?: number;
  // Seconds each code lasts: 30 unless the app says otherwise.
  period?: number;
  algorithm?: TotpAlgorithm;
  // The moment to work it out for. Default: now.
  at?: Date | number;
  // Wait for the next code when this one has fewer seconds left, so it
  // doesn't run out between working it out and the app checking it (5 is
  // plenty for most tests). Only without at.
  minSecondsLeft?: number;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Bytes(secret: string): Uint8Array<ArrayBuffer> {
  const clean = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean) throw new Error('The TOTP secret is empty.');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('The TOTP secret must be base32 (A to Z and 2 to 7), as the app shows it, or its otpauth:// address.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// The secret and any digits, period and algorithm an otpauth:// address gives.
function readTotpSecret(secret: string): { key: string; digits?: number; period?: number; algorithm?: TotpAlgorithm } {
  if (!/^otpauth:\/\//i.test(secret.trim())) return { key: secret };
  const url = new URL(secret.trim());
  if (url.hostname.toLowerCase() !== 'totp') throw new Error('Only otpauth://totp/ addresses are time-based codes.');
  const key = url.searchParams.get('secret');
  if (!key) throw new Error('The otpauth:// address has no secret.');
  const algorithm = url.searchParams.get('algorithm')?.toUpperCase().replace(/^SHA(\d)/, 'SHA-$1') as TotpAlgorithm | undefined;
  const number = (name: string) => (url.searchParams.has(name) ? Number(url.searchParams.get(name)) : undefined);
  return { key, digits: number('digits'), period: number('period'), algorithm };
}

async function hmac(algorithm: TotpAlgorithm, key: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  // Node 18 has Web Crypto only through node:crypto.
  const subtle =
    globalThis.crypto?.subtle ?? ((await import(/* @vite-ignore */ 'node:crypto' as string)) as { webcrypto: { subtle: typeof globalThis.crypto.subtle } }).webcrypto.subtle;
  const cryptoKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', cryptoKey, message));
}

export async function totpCode(secret: string, options: TotpOptions = {}): Promise<string> {
  const given = readTotpSecret(secret);
  const digits = options.digits ?? given.digits ?? 6;
  const period = options.period ?? given.period ?? 30;
  const algorithm = options.algorithm ?? given.algorithm ?? 'SHA-1';
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new Error('digits must be a whole number from 6 to 10.');
  if (!Number.isInteger(period) || period < 1) throw new Error('period must be a whole number of seconds.');
  if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('algorithm must be SHA-1, SHA-256 or SHA-512.');
  const key = base32Bytes(given.key);
  let ms = options.at === undefined ? Date.now() : options.at instanceof Date ? options.at.getTime() : options.at;
  if (options.at === undefined && options.minSecondsLeft) {
    const left = period - ((ms / 1000) % period);
    if (left < Math.min(options.minSecondsLeft, period)) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(left * 1000) + 50));
      ms = Date.now();
    }
  }
  const counter = Math.floor(ms / 1000 / period);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const mac = await hmac(algorithm, key, message);
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// Whether a value follows a format from getFormSection: its shape and, where
// there is one, its check digit. It runs here, so an ID never leaves this
// machine. Following the format isn't being valid: only the issuer knows
// whether a number was given to anyone (New in 0.13.0).
export function followsFormat(format: { pattern: string; check: FormatCheck | null; name?: string; shape?: string }, value: string): { follows: boolean; problem?: string } {
  const compact = value.normalize('NFKC').toUpperCase().replace(/[\s.\-/]/g, '');
  if (!new RegExp(format.pattern).test(compact)) return { follows: false, problem: `It doesn’t have the shape${format.shape ? ` (${format.shape})` : ''}.` };
  if (format.check && !FORMAT_CHECKS[format.check](compact)) return { follows: false, problem: 'Its check digit is wrong.' };
  return { follows: true };
}

const numbers = (value: string) => [...value].map(Number);
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 8, 5],
];
const mod11 = (value: string) => {
  const sum = numbers(value).reduce((total, n, i) => total + n * (value.length + 1 - i), 0);
  const r = (sum * 10) % 11;
  return String(r === 10 ? 0 : r);
};
const cnpjDigit = (value: string) => {
  let sum = 0;
  [...value].reverse().forEach((char, i) => (sum += (char.charCodeAt(0) - 48) * (2 + (i % 8))));
  const r = sum % 11;
  return String(r < 2 ? 0 : 11 - r);
};
const icao = (value: string) => {
  let sum = 0;
  [...value].forEach((char, i) => (sum += (char === '<' ? 0 : /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 55) * [7, 3, 1][i % 3]!));
  return String(sum % 10);
};
const FORMAT_CHECKS: Record<FormatCheck, (value: string) => boolean> = {
  verhoeff: (value) => {
    let c = 0;
    numbers(value)
      .reverse()
      .forEach((n, i) => (c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![n]!]!));
    return c === 0;
  },
  cpf: (value) => {
    const first = mod11(value.slice(0, 9));
    return value.slice(9) === first + mod11(value.slice(0, 9) + first);
  },
  cnpj: (value) => {
    const first = cnpjDigit(value.slice(0, 12));
    return value.slice(12) === first + cnpjDigit(value.slice(0, 12) + first);
  },
  gb11643: (value) =>
    value.slice(-1) === '10X98765432'[numbers(value.slice(0, 17)).reduce((total, n, i) => total + n * [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2][i]!, 0) % 11],
  my_number: (value) => {
    const r = numbers(value.slice(0, 11)).reverse().reduce((total, n, i) => total + n * (i < 6 ? i + 2 : i - 4), 0) % 11;
    return value.slice(-1) === String(r <= 1 ? 0 : 11 - r);
  },
  abn: (value) => numbers(value).reduce((total, n, i) => total + (i === 0 ? n - 1 : n) * [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19][i]!, 0) % 89 === 0,
  gb_vat: (value) => {
    const nine = value.replace(/^GB/, '');
    const sum = numbers(nine.slice(0, 7)).reduce((total, n, i) => total + n * (8 - i), 0) + Number(nine.slice(7, 9));
    return sum % 97 === 0 || (sum + 55) % 97 === 0;
  },
  icao: (value) => value.slice(-1) === icao(value.slice(0, -1)),
};
