// The client is built without Node's types (it runs anywhere fetch does), so
// the tests declare just the part of node:util they use.
declare module 'node:util' {
  export function inspect(value: unknown, options?: { showHidden?: boolean; depth?: number }): string;
}
