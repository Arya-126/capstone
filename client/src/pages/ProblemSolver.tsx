import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import RichText from '../components/RichText';

// Standalone problem solver (outside timed assessments):
// left = statement/constraints/sample I/O, right = language picker + editor +
// Run (sample tests, full output) and Submit (hidden tests, verdict only).

interface SampleIo {
  input: string;
  output: string;
}

interface Problem {
  id: string;
  title: string;
  statement: string;
  difficulty: string;
  constraints: string | null;
  sampleIo: SampleIo[];
  starterCode: Record<string, string>;
  timeLimitMs: number;
  languages: string[];
}

interface RunCase {
  case: number;
  status: string;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  expected: string | null;
  timeSec: number | null;
}

interface RunResponse {
  results: RunCase[];
  passed: number;
  total: number;
}

interface SubmitCase {
  case: number;
  sample: boolean;
  status: string;
  timeSec: number | null;
}

interface SubmitResponse {
  passed: number;
  total: number;
  score: number;
  allPassed: boolean;
  breakdown: SubmitCase[];
  compileOutput?: string | null;
}

const DIFF_CHIP: Record<string, string> = {
  EASY: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HARD: 'bg-rose-100 text-rose-700',
};

export const ProblemSolver: React.FC<{
  slug: string;
  onBack: () => void;
  onSolved?: () => void;
}> = ({ slug, onBack, onSolved }) => {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState('python');
  // user edits kept per language so switching languages never loses work
  const [code, setCode] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [runOut, setRunOut] = useState<RunResponse | null>(null);
  const [submitOut, setSubmitOut] = useState<SubmitResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setProblem(null);
    setError(null);
    setCode({});
    setRunOut(null);
    setSubmitOut(null);
    setActionError(null);
    apiClient
      .get<Problem>(`/code/problems/${slug}`)
      .then((p) => {
        setProblem(p);
        const langs = p.languages?.length ? p.languages : Object.keys(p.starterCode || {});
        setLanguage(langs.includes('python') ? 'python' : langs[0] || 'python');
      })
      .catch((e) => setError(e?.message || 'Failed to load the problem'));
  }, [slug]);

  const currentCode = code[language] ?? problem?.starterCode?.[language] ?? '';

  const updateCode = (value: string) => {
    setCode((c) => ({ ...c, [language]: value }));
  };

  // Tab inserts 4 spaces instead of leaving the editor
  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = currentCode.slice(0, start) + '    ' + currentCode.slice(end);
    updateCode(next);
    requestAnimationFrame(() => {
      const node = editorRef.current;
      if (node) node.selectionStart = node.selectionEnd = start + 4;
    });
  };

  const run = async () => {
    if (!problem || busy) return;
    setBusy('run');
    setRunOut(null);
    setSubmitOut(null);
    setActionError(null);
    try {
      const r = await apiClient.post<RunResponse>('/code/run', {
        problemId: problem.id,
        language,
        source: currentCode,
      });
      setRunOut(r);
    } catch (e: any) {
      setActionError(e?.message || 'Run failed');
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!problem || busy) return;
    setBusy('submit');
    setRunOut(null);
    setSubmitOut(null);
    setActionError(null);
    try {
      const r = await apiClient.post<SubmitResponse>('/code/submit', {
        problemId: problem.id,
        language,
        source: currentCode,
      });
      setSubmitOut(r);
      if (r.allPassed) onSolved?.();
    } catch (e: any) {
      setActionError(e?.message || 'Submit failed');
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto bg-red-50 p-8 rounded-xl text-center">
        <p className="text-red-700 font-bold mb-4">{error}</p>
        <button onClick={onBack} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg">
          ← Back
        </button>
      </div>
    );
  }
  if (!problem) {
    return <div className="text-gray-500 italic p-12 text-center">Loading problem…</div>;
  }

  const languages = problem.languages?.length
    ? problem.languages
    : Object.keys(problem.starterCode || { python: '' });

  return (
    <div className="max-w-6xl mx-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          className="bg-white shadow rounded-lg px-3 py-2 font-bold text-sm hover:bg-gray-50"
        >
          ← Back
        </button>
        <h1 className="text-xl font-black flex-1 min-w-0 truncate">{problem.title}</h1>
        <span
          className={`text-xs font-black px-2.5 py-1 rounded-full ${
            DIFF_CHIP[problem.difficulty] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {problem.difficulty}
        </span>
        <span className="text-xs font-bold text-gray-400">⏱ {problem.timeLimitMs} ms limit</span>
      </div>

      {/* solved banner */}
      {submitOut?.allPassed && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl shadow p-4 mb-4 text-center font-black text-lg">
          🎉 Solved! All {submitOut.total} hidden tests passed · score {submitOut.score}%
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* left: statement */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-black text-sm text-gray-400 uppercase mb-2">Problem</h2>
          <div className="text-sm mb-4">
            <RichText text={problem.statement} />
          </div>
          {problem.constraints && (
            <div className="mb-4">
              <h3 className="font-black text-xs text-gray-400 uppercase mb-1">Constraints</h3>
              <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
                <RichText text={problem.constraints} />
              </div>
            </div>
          )}
          {(problem.sampleIo || []).map((io, i) => (
            <div key={i} className="mb-3">
              <h3 className="font-black text-xs text-gray-400 uppercase mb-1">Sample {i + 1}</h3>
              <div className="text-xs bg-gray-50 rounded-lg p-3 font-mono whitespace-pre-wrap">
                <span className="font-black">Input:</span>
                {'\n'}
                {io.input}
                {'\n'}
                <span className="font-black">Output:</span>
                {'\n'}
                {io.output}
              </div>
            </div>
          ))}
        </div>

        {/* right: editor */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center gap-3 mb-3">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="border rounded-lg px-3 py-2 font-bold text-sm"
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              disabled={busy !== null}
              onClick={run}
              className="px-4 py-2 rounded-lg font-bold bg-gray-800 text-white text-sm disabled:opacity-50"
            >
              {busy === 'run' ? 'Running…' : '▶ Run samples'}
            </button>
            <button
              disabled={busy !== null}
              onClick={submit}
              className="px-4 py-2 rounded-lg font-bold bg-emerald-600 text-white text-sm disabled:opacity-50"
            >
              {busy === 'submit' ? 'Judging…' : '✓ Submit'}
            </button>
          </div>

          <textarea
            ref={editorRef}
            value={currentCode}
            onChange={(e) => updateCode(e.target.value)}
            onKeyDown={onEditorKeyDown}
            spellCheck={false}
            className="w-full h-80 border rounded-lg p-3 font-mono text-sm bg-gray-900 text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {actionError && (
            <div className="mt-3 bg-red-50 text-red-700 font-bold text-sm rounded-lg p-3">
              {actionError}
            </div>
          )}

          {/* run output: sample tests, full detail */}
          {runOut && (
            <div className="mt-3 bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono">
              <div className="font-black mb-2">
                Sample tests: {runOut.passed}/{runOut.total} passed
              </div>
              {runOut.results.map((r) => (
                <div key={r.case} className="mb-2">
                  <div className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                    case {r.case}: {r.status}
                    {r.timeSec != null && <span className="text-gray-500"> · {r.timeSec}s</span>}
                  </div>
                  {!r.passed && r.stdout != null && (
                    <div className="text-gray-400 text-xs whitespace-pre-wrap">
                      got: {JSON.stringify(r.stdout?.slice(0, 200))}
                      {'\n'}want: {JSON.stringify(r.expected?.slice(0, 200))}
                    </div>
                  )}
                  {r.stderr && (
                    <pre className="text-amber-300 text-xs whitespace-pre-wrap mt-1">
                      {r.stderr.slice(0, 400)}
                    </pre>
                  )}
                  {r.compileOutput && (
                    <pre className="text-amber-300 text-xs whitespace-pre-wrap mt-1">
                      {r.compileOutput.slice(0, 400)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* submit output: hidden-test verdict, categories only */}
          {submitOut && (
            <div className="mt-3 bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono">
              <div className={`font-black mb-2 ${submitOut.allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                {submitOut.allPassed ? '✅ Accepted' : '❌ Not accepted'} · {submitOut.passed}/
                {submitOut.total} passed · score {submitOut.score}%
              </div>
              {submitOut.breakdown.map((b) => (
                <div
                  key={b.case}
                  className={b.status === 'Accepted' ? 'text-emerald-400' : 'text-red-400'}
                >
                  case {b.case}
                  {b.sample ? ' (sample)' : ' (hidden)'}: {b.status}
                  {b.timeSec != null && <span className="text-gray-500"> · {b.timeSec}s</span>}
                </div>
              ))}
              {submitOut.compileOutput && (
                <pre className="text-amber-300 text-xs whitespace-pre-wrap mt-2">
                  {submitOut.compileOutput.slice(0, 500)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
