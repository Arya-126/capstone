/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// sql.js — used by SqlPuzzle.tsx (dynamically imported). We use it loosely
// as `any`; the runtime shape is `initSqlJs({locateFile}) → Promise<SqlLib>`.
declare module 'sql.js';
declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string;
  export default url;
}
