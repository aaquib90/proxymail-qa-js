// As node-util.d.ts: just the part of node:fs the tests use.
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}
