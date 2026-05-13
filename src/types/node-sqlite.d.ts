declare module "node:sqlite" {
  interface DatabaseSync {
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }

  interface StatementSync {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }

  interface DatabaseConstructor {
    new (location: string): DatabaseSync;
  }

  const DatabaseSync: DatabaseConstructor;
  export { DatabaseSync };
}
