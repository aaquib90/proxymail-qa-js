// The client is built without Node's types, so cli.ts declares just the part
// of node:fs/promises it uses.
declare module 'node:fs/promises' {
  export function readFile(path: string | URL, encoding: 'utf8'): Promise<string>;
}
