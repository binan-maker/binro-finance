declare module 'bun:test' {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export const mock: {
    module: (moduleId: string, factory: () => unknown) => void;
    fn: <T extends (...args: never[]) => unknown>(impl?: T) => T;
  };
  export function expect<T>(actual: T): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(expected: number): void;
    toContain(expected: unknown): void;
    toThrow(expected?: unknown): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeNull(): void;
      toBeUndefined(): void;
      toContain(expected: unknown): void;
    };
  };
}

declare module 'bun:sqlite' {
  export class Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class Database {
    constructor(filename?: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}

declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Dirent[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}
