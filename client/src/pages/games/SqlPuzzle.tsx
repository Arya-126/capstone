import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { SQL_PUZZLES, SqlPuzzle } from './sqlPuzzleData';

// SQL Puzzle — write a query against a tiny schema, get instant feedback.
// sql.js is dynamic-imported (~1MB WASM) so it only loads when this page
// actually renders. Row-set comparison is order-insensitive by default;
// puzzles that require ordering set `mustBeOrdered: true`.

// sql.js has poor typings — pull just what we need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlDb = { exec: (q: string) => any[]; close: () => void };

// Vite handles the WASM URL through its ?url import syntax
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore  — vite provides this at build time
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SqlLibPromise: Promise<any> | null = null;
async function loadSql() {
  if (!SqlLibPromise) {
    SqlLibPromise = (async () => {
      const initSqlJs = (await import('sql.js')).default;
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
  }
  return SqlLibPromise;
}

// Normalize a value to a string for cell-by-cell comparison
function toCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  return String(v).trim();
}

// Row-set comparison. Column names must match (case-insensitive).
// Rows compared as arrays; sorted lexically for set-equality unless
// mustBeOrdered.
function compareResult(
  actual: { columns: string[]; values: any[][] } | null,
  expected: { columns: string[]; values: any[][] },
  mustBeOrdered: boolean,
): { ok: boolean; reason?: string } {
  if (!actual) return { ok: false, reason: 'Query returned no rows.' };
  if (actual.columns.length !== expected.columns.length) {
    return { ok: false, reason: `Wrong column count — got ${actual.columns.length}, expected ${expected.columns.length}.` };
  }
  const actCols = actual.columns.map((c) => c.toLowerCase());
  const expCols = expected.columns.map((c) => c.toLowerCase());
  for (let i = 0; i < actCols.length; i++) {
    if (actCols[i] !== expCols[i]) {
      return { ok: false, reason: `Column ${i + 1} should be "${expected.columns[i]}", got "${actual.columns[i]}".` };
    }
  }
  if (actual.values.length !== expected.values.length) {
    return { ok: false, reason: `Row count mismatch — got ${actual.values.length}, expected ${expected.values.length}.` };
  }
  const norm = (rows: any[][]) => rows.map((r) => r.map(toCell));
  const A = norm(actual.values);
  const E = norm(expected.values);
  if (mustBeOrdered) {
    for (let i = 0; i < A.length; i++) {
      if (A[i].join('|') !== E[i].join('|')) {
        return { ok: false, reason: `Row ${i + 1} differs (order matters here).` };
      }
    }
  } else {
    const sortedA = A.map((r) => r.join('|')).sort();
    const sortedE = E.map((r) => r.join('|')).sort();
    for (let i = 0; i < sortedA.length; i++) {
      if (sortedA[i] !== sortedE[i]) {
        return { ok: false, reason: 'Row values don\'t match the expected set.' };
      }
    }
  }
  return { ok: true };
}

const ResultTable: React.FC<{
  columns: string[];
  values: any[][];
  emptyText?: string;
  highlight?: 'ok' | 'err' | null;
}> = ({ columns, values, emptyText, highlight }) => {
  const border =
    highlight === 'ok' ? 'border-emerald-300' :
    highlight === 'err' ? 'border-red-300' : 'border-gray-200';
  if (values.length === 0) {
    return (
      <div className={`bg-slate-50 border ${border} rounded-lg p-3 text-xs text-slate-500 text-center`}>
        {emptyText || '(no rows)'}
      </div>
    );
  }
  return (
    <div className={`overflow-x-auto rounded-lg border ${border}`}>
      <table className="w-full text-xs font-mono">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-1.5 text-left font-black text-slate-700 uppercase tracking-wider">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1 text-slate-700">{toCell(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const SqlPuzzleGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * SQL_PUZZLES.length));
  const puzzle: SqlPuzzle = SQL_PUZZLES[idx];

  const [sqlReady, setSqlReady] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);
  const sqlLibRef = useRef<any>(null);

  const [query, setQuery] = useState('');
  const [actual, setActual] = useState<{ columns: string[]; values: any[][] } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);

  // Boot sql.js lazily on mount — first time this page loads incurs the WASM
  // download; subsequent mounts hit the cached module
  useEffect(() => {
    let cancelled = false;
    loadSql()
      .then((lib) => { if (!cancelled) { sqlLibRef.current = lib; setSqlReady(true); } })
      .catch((e) => { if (!cancelled) setWasmError(e?.message || 'Failed to load SQL engine'); });
    return () => { cancelled = true; };
  }, []);

  // Reset UI state when the puzzle changes
  useEffect(() => {
    setQuery('');
    setActual(null);
    setRunError(null);
    setCheck(null);
    setHintShown(false);
    setSolutionShown(false);
  }, [idx]);

  const runQuery = () => {
    if (!sqlReady || !sqlLibRef.current) return;
    setRunError(null);
    setCheck(null);
    let db: SqlDb | null = null;
    try {
      db = new sqlLibRef.current.Database();
      db!.exec(puzzle.schemaSql);
      const results = db!.exec(query);
      if (!results || results.length === 0) {
        setActual({ columns: [], values: [] });
      } else {
        const last = results[results.length - 1];
        setActual({ columns: last.columns as string[], values: last.values as any[][] });
      }
    } catch (e: any) {
      setRunError(e?.message || 'Query failed');
      setActual(null);
    } finally {
      db?.close();
    }
  };

  const checkAnswer = () => {
    if (!actual) return;
    setCheck(compareResult(actual, puzzle.expectedResult, !!puzzle.mustBeOrdered));
  };

  const nextPuzzle = () => {
    // pick a different random puzzle if there's more than one
    if (SQL_PUZZLES.length <= 1) return;
    let next = idx;
    while (next === idx) next = Math.floor(Math.random() * SQL_PUZZLES.length);
    setIdx(next);
  };

  const diffColor = puzzle.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-800' :
                    puzzle.difficulty === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';

  return (
    <div className="max-w-4xl mx-auto py-6">
      <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>

      <div className="bg-white p-5 rounded-2xl shadow mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">🗄 SQL Puzzle · {puzzle.subject}</span>
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${diffColor}`}>{puzzle.difficulty}</span>
        </div>
        <h1 className="text-xl font-black text-gray-900">{puzzle.title}</h1>
        <p className="text-sm text-gray-700 mt-2">{puzzle.prompt}</p>

        <div className="mt-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Schema</div>
          <pre className="bg-slate-950 text-slate-200 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">{puzzle.schemaSql.trim()}</pre>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Your query</div>
          {!sqlReady && !wasmError && (
            <div className="text-xs text-amber-600 animate-pulse">Loading SQL engine…</div>
          )}
          {wasmError && <div className="text-xs text-red-600">{wasmError}</div>}
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ height: 200 }}>
          <Editor
            language="sql"
            value={query}
            theme="vs-dark"
            onChange={(v) => setQuery(v ?? '')}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={runQuery}
            disabled={!sqlReady || !query.trim()}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-black disabled:opacity-40"
          >
            ▶ Run
          </button>
          <button
            onClick={checkAnswer}
            disabled={!actual || !!runError}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-40"
          >
            Check
          </button>
          <button
            onClick={() => setHintShown(true)}
            disabled={hintShown}
            className="px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold disabled:opacity-50"
          >
            💡 Hint
          </button>
          <button
            onClick={() => setSolutionShown(true)}
            disabled={solutionShown}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
          >
            Give up
          </button>
          <div className="flex-1" />
          <button
            onClick={nextPuzzle}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
          >
            🔄 Next puzzle
          </button>
        </div>

        {hintShown && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900">
            💡 {puzzle.hint}
          </div>
        )}
        {solutionShown && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Reference solution</div>
            <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap">{puzzle.solution.trim()}</pre>
          </div>
        )}
      </div>

      {(actual || runError) && (
        <div className="bg-white p-5 rounded-2xl shadow mb-4">
          {runError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 font-mono whitespace-pre-wrap">
              {runError}
            </div>
          ) : (
            <>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Your result</div>
              <ResultTable
                columns={actual!.columns}
                values={actual!.values}
                emptyText="(query returned no rows)"
                highlight={check?.ok ? 'ok' : check?.ok === false ? 'err' : null}
              />
              {check && (
                <div className={`mt-3 p-3 rounded-xl text-sm ${check.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                  <b>{check.ok ? '🎉 Correct!' : '❌ Not quite'}</b> {check.reason || ''}
                </div>
              )}
              {check && !check.ok && (
                <div className="mt-3">
                  <div className="text-[10px] font-black uppercase text-emerald-700 mb-1">Expected result</div>
                  <ResultTable columns={puzzle.expectedResult.columns} values={puzzle.expectedResult.values} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
