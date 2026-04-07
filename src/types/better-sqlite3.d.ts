// Minimal declaration to satisfy TypeScript — full types via @types/better-sqlite3 if needed.
declare module 'better-sqlite3' {
  interface Statement {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): unknown;
  }
  interface Database {
    prepare(sql: string): Statement;
    close(): void;
  }
  interface DatabaseConstructor {
    new(filename: string, options?: { readonly?: boolean; memory?: boolean }): Database;
    default: DatabaseConstructor;
  }
  const Database: DatabaseConstructor;
  export default Database;
}
