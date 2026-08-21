import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { apiClient } from '../services/api';
import { SelfViewCamera } from '../components/SelfViewCamera';
import { useCameraStream } from '../hooks/useCameraStream';
import { useFacePresence } from '../hooks/useFacePresence';

// Live coding interview room. Two phases:
//   'consent' — camera/mic permission checkboxes, no stream yet
//   'room'    — the split-pane test interface, camera + Monaco editor + Run/Submit
//
// Run vs Submit (Tier 2E):
//   Run    → POST /code/run       — sample tests only, full output visible
//   Submit → POST /code/submit    — hidden tests, verdict + counts only, then
//             POST /ai-interview/:id/score-coding for the AI rubric review
//
// Editor is Monaco (Tier 2B) — syntax highlighting, brace matching, line
// numbers. Per-language code preservation matches ProblemSolver.tsx.

const LANGUAGES = [
  { id: 'python', label: 'Python 3', monaco: 'python' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'cpp', label: 'C++', monaco: 'cpp' },
  { id: 'java', label: 'Java', monaco: 'java' },
];

const DEFAULT_STARTER: Record<string, string> = {
  python: '# Write your solution here\n',
  javascript: '// Write your solution here\n',
  cpp: '// Write your solution here\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  return 0;\n}\n',
  java: 'import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n\n  }\n}\n',
};

interface Problem {
  id: string;
  slug: string;
  title: string;
  statement?: string;    // /code/problems/:slug shape
  description?: string;  // legacy
  difficulty: string;
  starterCode?: Record<string, string>;
  sampleIo?: { input: string; output: string; explanation?: string }[];
  sampleTestCases?: { input: string; output: string }[]; // legacy
  constraints?: string | null;
  timeLimitMs?: number;
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
interface SubmitResponse {
  passed: number;
  total: number;
  score: number;
  allPassed: boolean;
  breakdown: { case: number; sample: boolean; status: string; timeSec: number | null }[];
  compileOutput?: string | null;
}

interface EvaluationResult {
  id: string;
  overallScore: number | null;
  rubricScores: Record<string, number> | null;
  summary: {
    strengths?: string[];
    gaps?: string[];
    nextSteps?: string[];
    complexityAnalysis?: { time: string; space: string };
    alternativeApproach?: string;
  } | null;
}

export const CodingInterviewRoom: React.FC<{
  role: string;
  companyId?: string | null;
  onExit: () => void;
  onComplete: (interviewId: string) => void;
}> = ({ role, companyId, onExit, onComplete }) => {
  // ---- phase ----
  const [phase, setPhase] = useState<'consent' | 'room'>('consent');
  const [consentCam, setConsentCam] = useState(false);
  const [consentMic, setConsentMic] = useState(false);

  // ---- interview + problem ----
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- editor state — per-language so switching preserves work ----
  const [language, setLanguage] = useState<string>('python');
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>({});
  const codeForLang = (l: string) =>
    codeByLang[l] ?? problem?.starterCode?.[l] ?? DEFAULT_STARTER[l] ?? '';
  const code = codeForLang(language);
  const setCode = (v: string) => setCodeByLang((prev) => ({ ...prev, [language]: v }));

  // ---- run / submit output ----
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runOut, setRunOut] = useState<RunResponse | null>(null);
  const [submitOut, setSubmitOut] = useState<SubmitResponse | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  // ---- timer (count-up for now — countdown lands in Tier 3) ----
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'room') return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ---- camera + proctoring — only after user hits Start ----
  const inRoom = phase === 'room';
  const { stream, status: cameraStatus } = useCameraStream(inRoom && consentCam);
  const proctorCounts = useRef<Record<string, number>>({
    FACE_NOT_DETECTED: 0,
    MULTIPLE_FACES: 0,
    NO_CAMERA: 0,
    faceChecks: 0,
  });
  const { faceStatus } = useFacePresence(stream, inRoom && consentCam, (type) => {
    proctorCounts.current[type] = (proctorCounts.current[type] || 0) + 1;
  });
  useEffect(() => {
    if (inRoom && consentCam && cameraStatus === 'denied') {
      proctorCounts.current.NO_CAMERA += 1;
    }
  }, [cameraStatus, inRoom, consentCam]);

  // ---- start the interview after consent ----
  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // 1. Start the AiInterview row (roundType='coding') — server also picks
      //    a problem via selectedQuestionIds
      const iv = await apiClient.post<any>('/ai-interview/start', {
        role,
        roundType: 'coding',
        ...(companyId ? { companyId } : {}),
      });
      setInterviewId(iv.id);

      // 2. Resolve the problem — prefer the server-selected one, else the
      //    first available. We fetch via /code/problems/:slug which returns
      //    { statement, sampleIo, starterCode, ... }
      let prob: Problem | null = null;
      const selId = iv.selectedQuestionIds?.[0];
      if (selId) {
        try {
          // The seed row id doesn't help /code/problems/:slug — grab the list
          // and match by id (small table, cheap).
          const list = await apiClient.get<{ id: string; slug: string }[]>('/code/problems');
          const match = list.find((p) => p.id === selId);
          if (match) prob = await apiClient.get<Problem>(`/code/problems/${match.slug}`);
        } catch { /* fall through */ }
      }
      if (!prob) {
        const list = await apiClient.get<{ slug: string }[]>('/code/problems');
        if (list.length > 0) prob = await apiClient.get<Problem>(`/code/problems/${list[0].slug}`);
      }
      if (!prob) throw new Error('No coding problem is available on the server.');
      setProblem(prob);

      // 3. Seed the editor with the problem's starter code per language
      const seeded: Record<string, string> = {};
      for (const l of LANGUAGES) {
        seeded[l.id] = prob.starterCode?.[l.id] ?? DEFAULT_STARTER[l.id];
      }
      setCodeByLang(seeded);

      setPhase('room');
    } catch (e: any) {
      setError(e?.message || 'Could not start the coding interview.');
    } finally {
      setBusy(false);
    }
  }, [role, companyId]);

  // ---- Run: sample tests only, full output ----
  const runSamples = async () => {
    if (!problem || running || submitting) return;
    setRunning(true);
    setRunOut(null);
    setSubmitOut(null);
    try {
      const res = await apiClient.post<RunResponse>('/code/run', {
        problemId: problem.id,
        language,
        source: code,
      });
      setRunOut(res);
    } catch (e: any) {
      setError(e?.message || 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  // ---- Submit: hidden tests + AI review ----
  const submitFinal = async () => {
    if (!interviewId || !problem || submitting || running) return;
    if (!confirm('Submit your final solution? The interview will end and be scored.')) return;
    setSubmitting(true);
    setError(null);
    setRunOut(null);
    try {
      // 1. Hidden-test run — this is the truth we score against
      const sub = await apiClient.post<SubmitResponse>('/code/submit', {
        problemId: problem.id,
        language,
        source: code,
      });
      setSubmitOut(sub);

      // 2. Fire the AI rubric review
      const elapsedMin = Math.max(1, Math.round(elapsed / 60));
      const scored = await apiClient.post<EvaluationResult>(
        `/ai-interview/${interviewId}/score-coding`,
        {
          problemId: problem.id,
          code,
          language,
          passed: sub.passed,
          total: sub.total,
          elapsedMinutes: elapsedMin,
        },
      );

      // 3. Post proctoring counts (fire-and-forget, informational)
      try {
        await apiClient.post(`/ai-interview/${interviewId}/proctoring-summary`, {
          counts: proctorCounts.current,
        });
      } catch { /* signal only */ }

      setEvaluation(scored);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ---- consent phase ----
  if (phase === 'consent') {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[100] flex items-center justify-center p-6 font-sans overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">💻</div>
            <h1 className="text-2xl font-black text-gray-900">Live Coding Interview</h1>
            <p className="text-sm text-gray-500 mt-1">{role}{companyId ? ` · ${companyId}` : ''}</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-sm space-y-2 text-gray-700">
            <p><b>What to expect:</b></p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>One coding problem in a split-pane editor</li>
              <li><b>Run</b> executes against sample tests with full output</li>
              <li><b>Submit</b> runs hidden tests and ends the interview with an AI rubric review</li>
              <li>Timer counts up — take your time</li>
              <li>Camera on = live proctoring (event counts only, not a verdict)</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-slate-50 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={consentCam}
              onChange={(e) => setConsentCam(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <b className="text-gray-900">Enable camera</b>
              <span className="block text-xs text-gray-500">
                Face-presence check runs locally in your browser. Camera turns on only after you click Start.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-slate-50 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={consentMic}
              onChange={(e) => setConsentMic(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <b className="text-gray-900">Enable microphone</b>
              <span className="block text-xs text-gray-500">
                Optional. Talking through your approach is good practice — we do not record audio.
              </span>
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onExit}
              disabled={busy}
              className="px-5 py-3 rounded-xl font-bold text-gray-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={begin}
              disabled={busy}
              className="flex-1 py-3 rounded-xl font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 transition disabled:opacity-40"
            >
              {busy ? 'Preparing…' : '🚀 Start the interview'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- evaluation report modal (after submit) ----
  if (evaluation) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[100] flex items-center justify-center p-4 overflow-y-auto font-sans">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 my-8 text-slate-900">
          <div className="text-center mb-6">
            <div className="text-5xl font-black text-indigo-600 mb-1">
              {evaluation.overallScore != null ? evaluation.overallScore : '—'}
            </div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              AI Coding Review Score / 100
            </div>
          </div>

          {submitOut && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-center text-sm">
              <b>Hidden tests:</b> {submitOut.passed} / {submitOut.total} passed
              {submitOut.allPassed && <span className="ml-2 font-black text-emerald-700">✓ ALL PASSED</span>}
            </div>
          )}

          {evaluation.rubricScores && (
            <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {Object.entries(evaluation.rubricScores).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <div className="flex justify-between font-bold text-slate-700 capitalize">
                    <span>{k}</span>
                    <span>{v}/5</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                    <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${(v / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {evaluation.summary?.complexityAnalysis && (
            <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl mb-4 text-xs">
              <b className="text-indigo-900 block mb-1">⚡ Complexity Analysis:</b>
              <div className="flex gap-4 font-mono text-indigo-800">
                <span>Time: <b>{evaluation.summary.complexityAnalysis.time}</b></span>
                <span>Space: <b>{evaluation.summary.complexityAnalysis.space}</b></span>
              </div>
            </div>
          )}

          {evaluation.summary?.alternativeApproach && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 text-xs text-amber-900">
              <b>💡 Alternative Approach:</b> {evaluation.summary.alternativeApproach}
            </div>
          )}

          <button
            onClick={() => onComplete(evaluation.id)}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm transition"
          >
            Complete & View Full Dashboard Report
          </button>
        </div>
      </div>
    );
  }

  // ---- main room ----
  const statement = problem?.statement ?? problem?.description ?? '';
  const samples = problem?.sampleIo ?? problem?.sampleTestCases ?? [];

  return (
    <div className="fixed inset-0 bg-slate-900 text-slate-100 flex flex-col z-[100] overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">💻</span>
          <div>
            <h1 className="font-black text-sm text-white">Live Coding Interview</h1>
            <span className="text-xs text-indigo-400 font-semibold">
              {role}{companyId ? ` · ${companyId}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-amber-400">
            <span>⏱</span><span>{formatTimer(elapsed)}</span>
          </div>

          {consentCam && (
            <div className="w-24 h-16 rounded-lg overflow-hidden relative border border-slate-800">
              <SelfViewCamera active={true} proctoring={true} faceStatus={faceStatus} />
            </div>
          )}

          <button
            onClick={() => {
              if (confirm('Exit the interview? Your work will be lost.')) onExit();
            }}
            className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden min-h-0">
        {/* Left: Problem Spec */}
        <div className="p-6 overflow-y-auto border-r border-slate-800 bg-slate-900/50 space-y-4">
          {problem ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-white">{problem.title}</h2>
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  {problem.difficulty}
                </span>
              </div>

              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {statement}
              </div>

              {problem.constraints && (
                <div className="text-xs font-mono text-slate-400 bg-slate-950 p-3 rounded border border-slate-800">
                  <b className="text-slate-300">Constraints:</b> {problem.constraints}
                </div>
              )}

              {samples.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-black uppercase text-slate-400">Sample Tests</h3>
                  {samples.map((tc: any, idx: number) => (
                    <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono">
                      <div className="text-slate-400 mb-1">
                        Input: <span className="text-slate-200 whitespace-pre">{tc.input}</span>
                      </div>
                      <div className="text-slate-400">
                        Expected: <span className="text-emerald-400 whitespace-pre">{tc.output}</span>
                      </div>
                      {tc.explanation && (
                        <div className="text-slate-500 mt-1 italic">{tc.explanation}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-500 animate-pulse">Loading problem…</div>
          )}
        </div>

        {/* Right: Editor + console */}
        <div className="flex flex-col bg-slate-950 overflow-hidden min-h-0">
          {/* Controls bar */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Language:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs font-bold rounded px-2.5 py-1.5 text-white"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={runSamples}
                disabled={running || submitting || !problem}
                title="Run on sample tests only — full output shown"
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded border border-slate-700 disabled:opacity-40"
              >
                {running ? 'Running…' : '▶ Run'}
              </button>
              <button
                onClick={submitFinal}
                disabled={running || submitting || !problem}
                title="Submit final — hidden tests + AI review, ends the interview"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded shadow disabled:opacity-40"
              >
                {submitting ? 'Evaluating…' : '🚀 Submit'}
              </button>
            </div>
          </div>

          {/* Monaco editor — takes remaining vertical space */}
          <div className="flex-1 min-h-0">
            <Editor
              language={LANGUAGES.find((l) => l.id === language)?.monaco || 'plaintext'}
              value={code}
              theme="vs-dark"
              onChange={(v) => setCode(v ?? '')}
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

          {/* Output console — shows Run results (per-case) */}
          {runOut && (
            <div className="max-h-56 bg-slate-900 border-t border-slate-800 overflow-y-auto shrink-0">
              <div className="p-3 flex justify-between items-center border-b border-slate-800">
                <span className="text-xs font-black uppercase text-slate-400">Sample tests</span>
                <span className={`text-xs font-black ${runOut.passed === runOut.total ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {runOut.passed} / {runOut.total} passed
                </span>
              </div>
              <div className="p-3 space-y-2 text-xs font-mono">
                {runOut.results.map((r) => (
                  <div key={r.case} className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold">Case {r.case}</span>
                      <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                        {r.status}
                      </span>
                    </div>
                    {r.compileOutput && (
                      <pre className="text-red-400 whitespace-pre-wrap">{r.compileOutput}</pre>
                    )}
                    {r.stderr && !r.compileOutput && (
                      <pre className="text-red-400 whitespace-pre-wrap">{r.stderr}</pre>
                    )}
                    {r.stdout && (
                      <div className="text-slate-400">
                        Output: <pre className="text-slate-200 inline whitespace-pre-wrap">{r.stdout}</pre>
                      </div>
                    )}
                    {r.expected != null && !r.passed && (
                      <div className="text-slate-400">
                        Expected: <pre className="text-emerald-400 inline whitespace-pre-wrap">{r.expected}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-950/70 border-t border-red-900 text-red-200 text-xs shrink-0">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
