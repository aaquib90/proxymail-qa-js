#!/usr/bin/env node
// npx proxymail-qa …: runs cli-main.ts with Node's process. The client has no
// Node types (it runs wherever fetch does), so this file names just the parts
// of process it uses.
import { readFile } from 'node:fs/promises';
import { runCli } from './cli-main.js';

interface NodeProcess {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { isTTY?: boolean; write: (text: string) => boolean };
  stderr: { write: (text: string) => boolean };
  stdin: AsyncIterable<Uint8Array | string>;
}

const node = (globalThis as unknown as { process: NodeProcess }).process;

async function readStdin() {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of node.stdin) text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

async function version() {
  const meta = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return meta.version;
}

node.exitCode = await runCli(node.argv.slice(2), {
  env: node.env,
  out: (text) => void node.stdout.write(`${text}\n`),
  err: (text) => void node.stderr.write(`${text}\n`),
  tty: node.stdout.isTTY === true,
  readFile: (path) => readFile(path, 'utf8'),
  readStdin,
  version: await version(),
});
