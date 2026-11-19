// The proxymail-qa command (FM-14): the client's methods for terminals, npm
// scripts, JetBrains run configurations and CI. cli.ts runs it with Node's
// process; everything it touches comes in through io, so the tests run it
// without Node.
//
// The API key comes only from PROXYMAIL_QA_API_KEY, never from a flag, so it
// stays out of shell history and the process list.
import {
  ProxyMailQA,
  ProxyMailQAError,
  type AgeBand,
  type ClientOptions,
  type CodeType,
  type FillUnknownFields,
  type FormFieldInput,
  type LinkType,
  type Match,
} from './index.js';

export interface CliIo {
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
  // Whether out is a terminal: then answers are labelled lines, otherwise
  // bare values a script can read.
  tty: boolean;
  readFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
  version: string;
  // Tests pass a fetch; the command uses the global one.
  client?: (options: ClientOptions) => ProxyMailQA;
}

type Flag = 'boolean' | 'string';

const NEW_FLAGS = {
  persona: 'boolean',
  password: 'boolean',
  country: 'string',
  age: 'string',
  dob: 'string',
  'one-name': 'boolean',
  label: 'string',
  name: 'string',
  domain: 'string',
  days: 'string',
  site: 'string',
  environment: 'string',
  json: 'boolean',
} as const satisfies Record<string, Flag>;

const WAIT_FLAGS = {
  type: 'string',
  timeout: 'string',
  since: 'string',
  service: 'string',
  unused: 'boolean',
  site: 'string',
  json: 'boolean',
} as const satisfies Record<string, Flag>;

const COMMANDS: Record<string, { flags: Record<string, Flag>; args: number; usage: string }> = {
  new: { flags: NEW_FLAGS, args: 0, usage: NEW_USAGE() },
  'wait-code': { flags: WAIT_FLAGS, args: 1, usage: WAIT_USAGE('code') },
  'wait-link': { flags: { ...WAIT_FLAGS, app: 'boolean' }, args: 1, usage: WAIT_USAGE('link') },
  persona: {
    flags: { json: 'boolean' },
    args: 1,
    usage: 'proxymail-qa persona <address> [--json]\n\nThe test account’s persona: name, username, date of birth and country.',
  },
  'form-values': {
    flags: {
      address: 'string',
      site: 'string',
      page: 'string',
      screen: 'string',
      environment: 'string',
      guess: 'string',
      country: 'string',
      age: 'string',
      dob: 'string',
      'one-name': 'boolean',
      label: 'string',
      domain: 'string',
      days: 'string',
    },
    args: 1,
    usage: FORM_USAGE(),
  },
};

function NEW_USAGE() {
  return `proxymail-qa new [options]

Makes a test address with a persona (a made-up name, username and date of
birth). In a terminal it shows them all; piped, it prints the address, and the
password on a second line when you ask for one.

  --password           Also make a password, saved on the address. Shown once.
  --country <code>     Where the persona lives: JP, IN, PK, GB…
  --age <band>         adult, over21, under18, under15, under13, any,
                       turns18tomorrow or turned18today
  --dob <YYYY-MM-DD>   A date of birth instead of an age band
  --one-name           One name and no family name
  --no-persona         Just the address
  --label <text>       A label to find it by
  --name <name>        The part before the @ (random when left out)
  --domain <domain>    One of your project's mail domains
  --days <n>           How long it lasts
  --site <host>        Where it's used, such as staging.example.com
  --environment <env>  staging, local…
  --json               Everything as JSON`;
}

function WAIT_USAGE(kind: 'code' | 'link') {
  const types = kind === 'code' ? 'otp (the default), coupon or any' : 'verify, magic_signin, invite, reset, unsubscribe or any; several with commas';
  return `proxymail-qa wait-${kind} <address> [options]

Waits for the ${kind} from the newest email and prints it. Exits 1 with the
reason when nothing arrives in time.

  --type <type>        ${types}
  --timeout <seconds>  How long to wait (default 30)
  --since <time>       Only email after this time (ISO 8601). Default: the
                       last 15 minutes
  --service <name>     Only email from this service, by name or domain
  --unused             Only a ${kind} nobody has used yet${kind === 'link' ? '\n  --app                The link that opens a mobile app' : ''}
  --site <host>        The site the test started on, for the link check
  --json               The whole match as JSON`;
}

function FORM_USAGE() {
  return `proxymail-qa form-values <file> [options]

What to type in each field of a form. The file is JSON: a list of fields
({ "id", "type", "name", "label", "autocomplete"… }) or { "fields": [...] }
with any of the options below. Use - to read it from standard input. Prints
JSON: the address, persona, password (when one was made) and a value per field.

  --address <address>  Fill for this address instead of making a new one
  --site <host>        The site, for custom fields set to one site
  --page <path>        The page, such as /signup
  --screen <name>      A native app screen, instead of page
  --environment <env>  staging, local…
  --guess <mode>       all, required or off, for fields nobody taught
  --country <code>     For a new address: where the persona lives
  --age <band>         For a new address: an age band
  --dob <YYYY-MM-DD>   For a new address: a date of birth
  --one-name           For a new address: one name only
  --label, --domain, --days  As for new`;
}

const HELP = (version: string) => `proxymail-qa ${version}: test inboxes for sign-up, login and password reset

  proxymail-qa new [--password] [--country JP]   Make a test address
  proxymail-qa wait-code <address>               Wait for its code
  proxymail-qa wait-link <address>               Wait for its link
  proxymail-qa persona <address>                 Show its persona
  proxymail-qa form-values <file>                What to type in a form

proxymail-qa help <command> shows a command's options.

Set PROXYMAIL_QA_API_KEY to an API key from Project settings → API keys in
app.proxymail.qa. In a run (PROXYMAIL_QA_RUN, which the GitHub Action sets),
every call is added to the run's report.

More: https://proxymail.qa/docs/cli`;

class UsageError extends Error {}

interface Parsed {
  args: string[];
  flags: Record<string, string | boolean>;
}

// A small parser, the same on every Node version: --flag, --flag value,
// --flag=value, and --no-flag for switches.
export function parseFlags(argv: string[], spec: Record<string, Flag>): Parsed {
  const parsed: Parsed = { args: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      parsed.args.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--') || arg === '-') {
      if (arg.startsWith('-') && arg !== '-') throw new UsageError(`Unknown option ${arg}.`);
      parsed.args.push(arg);
      continue;
    }
    const [rawName, inline] = splitOnce(arg.slice(2), '=');
    const negated = rawName.startsWith('no-') && spec[rawName.slice(3)] === 'boolean';
    const name = negated ? rawName.slice(3) : rawName;
    const kind = spec[name];
    if (!kind) throw new UsageError(`Unknown option --${rawName}.`);
    if (kind === 'boolean') {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value.`);
      parsed.flags[name] = !negated;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) throw new UsageError(`--${name} needs a value.`);
    parsed.flags[name] = value;
  }
  return parsed;
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

const str = (flags: Parsed['flags'], name: string) => (typeof flags[name] === 'string' ? (flags[name] as string) : undefined);

function int(flags: Parsed['flags'], name: string) {
  const value = str(flags, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new UsageError(`--${name} takes a whole number.`);
  return Number(value);
}

function since(flags: Parsed['flags']) {
  const value = str(flags, 'since');
  if (value === undefined) return undefined;
  if (Number.isNaN(Date.parse(value))) throw new UsageError('--since takes a date and time, such as 2026-11-13T18:00:00Z.');
  return value;
}

// Labelled lines, the labels padded to one width.
function lines(rows: Array<[string, string | null | undefined]>) {
  const shown = rows.filter((row): row is [string, string] => row[1] !== null && row[1] !== undefined && row[1] !== '');
  const width = Math.max(...shown.map(([label]) => label.length));
  return shown.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n');
}

function personaRows(
  persona: { first_name: string | null; last_name: string | null; username: string | null; date_of_birth?: string; country?: string } | null,
) {
  if (!persona) return [];
  return [
    ['First name', persona.first_name],
    ['Last name', persona.last_name],
    ['Username', persona.username],
    ['Date of birth', persona.date_of_birth],
    ['Country', persona.country],
  ] as Array<[string, string | null | undefined]>;
}

function matchLines(match: Match, kind: 'Code' | 'Link') {
  return lines([
    [kind, match.value],
    ['From', match.service ?? match.service_domain],
    ['Expires', match.expires_at],
    ['Note', match.note],
    ['Link check', match.link_site?.status === 'fail' ? match.link_site.detail : undefined],
  ]);
}

function readFields(text: string, source: string): { fields: FormFieldInput[]; options: Record<string, unknown> } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UsageError(`${source} isn’t JSON: give a list of fields, or { "fields": [...] }.`);
  }
  if (Array.isArray(data)) return { fields: data as FormFieldInput[], options: {} };
  if (data && typeof data === 'object' && Array.isArray((data as { fields?: unknown }).fields)) {
    const { fields, ...options } = data as { fields: FormFieldInput[] };
    return { fields, options };
  }
  throw new UsageError(`${source} has no fields: give a list of fields, or { "fields": [...] }.`);
}

// Runs one command and returns the exit code: 0 done, 1 the API said no or
// nothing arrived, 2 the command was wrong.
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    const about = rest[0] && COMMANDS[rest[0]];
    io.out(about ? about.usage : HELP(io.version));
    return 0;
  }
  if (command === '--version' || command === '-v') {
    io.out(io.version);
    return 0;
  }
  const spec = COMMANDS[command];
  if (!spec) {
    io.err(`Unknown command ${command}.\n\n${HELP(io.version)}`);
    return 2;
  }
  let parsed: Parsed;
  try {
    if (rest.includes('--help') || rest.includes('-h')) {
      io.out(spec.usage);
      return 0;
    }
    parsed = parseFlags(rest, spec.flags);
    if (parsed.args.length !== spec.args)
      throw new UsageError(spec.args ? `${command} takes one ${command === 'form-values' ? 'file' : 'address'}.` : `${command} takes no arguments.`);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.err(`${error.message}\n\n${spec.usage}`);
    return 2;
  }

  try {
    const make = io.client ?? ((options: ClientOptions) => new ProxyMailQA(options));
    const env = io.env;
    if (!env.PROXYMAIL_QA_API_KEY) {
      io.err('Set PROXYMAIL_QA_API_KEY to an API key from Project settings → API keys in app.proxymail.qa.');
      return 2;
    }
    const qa = make({ apiKey: env.PROXYMAIL_QA_API_KEY });
    const { args, flags } = parsed;
    const json = flags.json === true;
    const show = (value: unknown) => io.out(JSON.stringify(value, null, io.tty ? 2 : undefined));

    if (command === 'new') {
      const created = await qa.createAddress({
        persona: flags.persona !== false,
        password: flags.password === true || undefined,
        country: str(flags, 'country')?.toUpperCase(),
        age: str(flags, 'age') as AgeBand | undefined,
        dateOfBirth: str(flags, 'dob'),
        oneName: flags['one-name'] === true || undefined,
        label: str(flags, 'label'),
        name: str(flags, 'name'),
        domain: str(flags, 'domain'),
        lifetimeDays: int(flags, 'days'),
        site: str(flags, 'site'),
        environment: str(flags, 'environment'),
      });
      if (json) show(created);
      else if (io.tty)
        io.out(lines([['Address', created.address], ['Password', created.password], ...personaRows(created.persona), ['Lasts until', created.expires_at]]));
      else io.out([created.address, created.password].filter(Boolean).join('\n'));
      return 0;
    }

    if (command === 'wait-code' || command === 'wait-link') {
      const options = {
        timeout: int(flags, 'timeout'),
        since: since(flags),
        service: str(flags, 'service'),
        unused: flags.unused === true || undefined,
        expectSite: str(flags, 'site'),
      };
      const type = str(flags, 'type');
      if (!io.tty && !json) io.err(`Waiting for a ${command === 'wait-code' ? 'code' : 'link'}…`);
      const match =
        command === 'wait-code'
          ? await qa.waitForCode(args[0]!, { ...options, type: type as CodeType | undefined })
          : await qa.waitForLink(args[0]!, {
              ...options,
              type: type?.includes(',') ? (type.split(',') as LinkType[]) : (type as LinkType | undefined),
              app: flags.app === true || undefined,
            });
      if (json) show(match);
      else io.out(io.tty ? matchLines(match, command === 'wait-code' ? 'Code' : 'Link') : match.value);
      return 0;
    }

    if (command === 'persona') {
      const address = await qa.getAddress(args[0]!);
      if (json) show(address.persona);
      else if (!address.persona) io.out('No persona on this address.');
      else io.out(lines(personaRows(address.persona)));
      return 0;
    }

    // form-values
    const source = args[0]!;
    const text = source === '-' ? await io.readStdin() : await io.readFile(source);
    const { fields, options } = readFields(text, source === '-' ? 'Standard input' : source);
    const values = await qa.formValues({
      ...options,
      fields,
      address: str(flags, 'address') ?? (options.address as string | undefined),
      site: str(flags, 'site') ?? (options.site as string | undefined),
      page: str(flags, 'page') ?? (options.page as string | undefined),
      screen: str(flags, 'screen') ?? (options.screen as string | undefined),
      environment: str(flags, 'environment') ?? (options.environment as string | undefined),
      guess: (str(flags, 'guess') as FillUnknownFields | undefined) ?? (options.guess as FillUnknownFields | undefined),
      country: str(flags, 'country')?.toUpperCase() ?? (options.country as string | undefined),
      age: (str(flags, 'age') as AgeBand | undefined) ?? (options.age as AgeBand | undefined),
      dateOfBirth: str(flags, 'dob') ?? (options.dateOfBirth as string | undefined),
      oneName: flags['one-name'] === true ? true : (options.oneName as boolean | undefined),
      label: str(flags, 'label') ?? (options.label as string | undefined),
      domain: str(flags, 'domain') ?? (options.domain as string | undefined),
      lifetimeDays: int(flags, 'days') ?? (options.lifetimeDays as number | undefined),
    });
    show(values);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\n\n${spec.usage}`);
      return 2;
    }
    if (error instanceof ProxyMailQAError) {
      io.err([error.message, error.help && `More: ${error.help}`].filter(Boolean).join('\n'));
      return 1;
    }
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
