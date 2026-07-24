declare module 'better-sqlite3' {
  interface Statement {
    all(params?: any): any[];
    get(params?: any): any;
    run(params?: any): any;
  }

  interface Database {
    prepare(sql: string): Statement;
    close(): void;
    readonly memory?: boolean;
  }

  class DatabaseConstructor {
    constructor(filename: string, options?: any);
    prepare(sql: string): Statement;
    close(): void;
  }

  export default DatabaseConstructor;
}
