import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliIo } from '../src/cli-main.ts';

// cli.ts is what npx proxymail-qa runs: it hands runCli Node's process. The
// command itself is tested through runCli in cli.test.ts; here, the wiring.
const cli = vi.hoisted(() => ({ runCli: vi.fn(async (_argv: string[], _io: CliIo) => 3) }));
vi.mock('../src/cli-main.ts', () => ({ runCli: cli.runCli }));

interface FakeProcess {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number | string;
  stdout: { isTTY?: boolean; write: (text: string) => boolean };
  stderr: { write: (text: string) => boolean };
  stdin: AsyncIterable<Uint8Array | string>;
}
const node = (globalThis as unknown as { process: FakeProcess }).process;
const saved = { argv: node.argv, exitCode: node.exitCode, stdin: Object.getOwnPropertyDescriptor(node, 'stdin') };

async function start(argv: string[]) {
  vi.resetModules();
  cli.runCli.mockClear();
  node.argv = ['/usr/local/bin/node', '/usr/local/bin/proxymail-qa', ...argv];
  try {
    await import('../src/cli.ts');
  } finally {
    node.argv = saved.argv;
  }
  const [passed, io] = cli.runCli.mock.calls[0]!;
  return { passed, io };
}

afterEach(() => {
  node.exitCode = saved.exitCode;
  if (saved.stdin) Object.defineProperty(node, 'stdin', saved.stdin);
  vi.restoreAllMocks();
});

describe('npx proxymail-qa', () => {
  it('runs the command with the arguments after the script, and exits with its code', async () => {
    const { passed } = await start(['wait-code', 'k7f2@mailclub.dev', '--timeout', '5']);
    expect(passed).toEqual(['wait-code', 'k7f2@mailclub.dev', '--timeout', '5']);
    expect(node.exitCode).toBe(3);
  });

  it('gives the version from the package, the environment and whether output is a terminal', async () => {
    const { io } = await start(['--version']);
    const meta = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(io.version).toBe(meta.version);
    expect(io.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(io.env).toBe(node.env);
    expect(io.tty).toBe(node.stdout.isTTY === true);
  });

  it('writes each answer and each error as a line of its own', async () => {
    const { io } = await start([]);
    const out = vi.spyOn(node.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(node.stderr, 'write').mockImplementation(() => true);
    io.out('k7f2@mailclub.dev');
    io.err('Unknown command make.');
    expect(out.mock.calls).toEqual([['k7f2@mailclub.dev\n']]);
    expect(err.mock.calls).toEqual([['Unknown command make.\n']]);
  });

  it('reads a file as text', async () => {
    const { io } = await start([]);
    expect(JSON.parse(await io.readFile('package.json'))).toMatchObject({ name: 'proxymail-qa' });
    await expect(io.readFile('no-such-fields.json')).rejects.toThrow(/ENOENT/);
  });

  it('reads standard input whole, a character split across chunks included', async () => {
    const { io } = await start(['form-values', '-']);
    const bytes = new TextEncoder().encode('[{"label":"Prénom"}');
    const split = bytes.indexOf(0xc3) + 1;
    async function* chunks() {
      // "é" is two bytes; the first chunk ends between them.
      yield bytes.slice(0, split);
      yield bytes.slice(split);
      yield ']\n';
    }
    Object.defineProperty(node, 'stdin', { value: chunks(), configurable: true });
    expect(await io.readStdin()).toBe('[{"label":"Prénom"}]\n');
  });
});
