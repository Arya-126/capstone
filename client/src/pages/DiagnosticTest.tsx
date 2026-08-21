import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';

// One-question-at-a-time diagnostic flow.
// - MCQ: 60s per question. Auto-advance on timeout (records unanswered).
// - Coding: shown as an optional skip in v1 (embedding ProblemSolver comes
//   later); user gets a "skip coding" button, response is submitted as 0/5.
// - No back button (per plan — prevents cheesing adaptive difficulty).

interface DiagItem {
  qId: string;
  kind: 'aptitude-mcq' | 'coreCS-mcq' | 'coding';
  pillar: 'aptitude' | 'coreCS' | 'coding';
  subtopic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeBudgetMs: number;
  prompt: string;
  options?: string[];
  problemSlug?: string;
}

interface StartResponse {
  attemptId: string;
  items: DiagItem[];
  resumed: boolean;
}

interface Response {
  qId: string;
  chosenIndex?: number;
  passed?: number;
  total?: number;
  timeMs: number;
}

export interface DiagnosticResultPayload {
  attemptId: string;
  perPillarScores: Record<string, number>;
  levelsAwarded: Record<string, number>;
  breakdown: Record<string, number>;
  overallBelt: string;
  labels: Record<string, string>;
}

const PILLAR_LABEL: Record<string, string> = {
  aptitude: '🧮 Aptitude',
  coreCS: '🖥️ Core CS',
  coding: '⚡ Coding',
};

export const DiagnosticTest: React.FC<{
  attemptId: string;
  onComplete: (result: DiagnosticResultPayload) => void;
  onAbort: () => void;
}> = ({ attemptId, onComplete, onAbort }) => {
  const [items, setItems] = useState<DiagItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap — the server may have already returned items when Intro called
  // /diagnostic/start, but we call it again here so a page-refresh mid-test
  // resumes the same attempt (start() is idempotent per user via the
  // IN_PROGRESS check on the server).
  useEffect(() => {
    let cancelled = false;
    apiClient
      .post<StartResponse>('/diagnostic/start', {})
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the diagnostic. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-question timer — resets on idx change. When it hits 0, record an
  // unanswered response and advance.
  const startTsRef = useRef<number>(0);
  useEffect(() => {
    if (!items || idx >= items.length) return;
    startTsRef.current = Date.now();
    setTimeLeftMs(items[idx].timeBudgetMs);
    setChosen(null);
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTsRef.current;
      const remaining = Math.max(0, items[idx].timeBudgetMs - elapsed);
      setTimeLeftMs(remaining);
      if (remaining === 0) {
        clearInterval(tick);
        recordAndAdvance(undefined); // timeout — no chosenIndex
      }
    }, 250);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, idx]);

  const recordAndAdvance = (chosenIndex: number | undefined) => {
    if (!items) return;
    const item = items[idx];
    const timeMs = Math.min(item.timeBudgetMs, Date.now() - startTsRef.current);
    const resp: Response =
      item.kind === 'coding'
        ? { qId: item.qId, passed: 0, total: 5, timeMs } // v1: coding always skipped
        : { qId: item.qId, chosenIndex, timeMs };
    const nextResponses = [...responses, resp];
    setResponses(nextResponses);
    if (idx + 1 >= items.length) {
      submit(nextResponses);
    } else {
      setIdx(idx + 1);
    }
  };

  const submit = async (finalResponses: Response[]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.post<DiagnosticResultPayload>(
        `/diagnostic/${attemptId}/submit`,
        { responses: finalResponses },
      );
      onComplete(result);
    } catch (e: any) {
      setError(e?.message || 'Grading failed. Your answers are safe — try again.');
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-10 text-center">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4">{error}</div>
        <button onClick={onAbort} className="text-sm font-bold text-gray-600 underline">
          Back to app
        </button>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-gray-500">
        <div className="animate-pulse text-sm font-semibold">Preparing your diagnostic…</div>
      </div>
    );
  }

  if (busy) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-gray-600">
        <div className="animate-pulse font-black text-lg">Grading your test…</div>
        <div className="text-xs text-gray-400 mt-2">Computing per-pillar levels and belt</div>
      </div>
    );
  }

  const item = items[idx];
  const total = items.length;
  const pctTime = (timeLeftMs / item.timeBudgetMs) * 100;
  const timeLabel =
    item.kind === 'coding'
      ? `${Math.ceil(timeLeftMs / 60000)} min`
      : `${Math.ceil(timeLeftMs / 1000)} s`;

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Progress dots */}
      <div className="flex items-center gap-1 mb-6">
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded ${
              i < idx ? 'bg-emerald-500' : i === idx ? 'bg-indigo-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
        <span>
          Question {idx + 1} / {total} · {PILLAR_LABEL[item.pillar]} · {item.subtopic}
        </span>
        <span className={pctTime < 20 ? 'text-red-600' : 'text-gray-700'}>{timeLabel} left</span>
      </div>

      {/* Time bar */}
      <div className="w-full bg-gray-100 rounded-full h-1 mb-6">
        <div
          className={`h-1 rounded-full transition-all ${pctTime < 20 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${pctTime}%` }}
        />
      </div>

      {/* Question */}
      <div className="bg-white p-6 rounded-2xl shadow-lg mb-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">
          {item.difficulty}
        </div>
        <div className="text-lg font-bold text-gray-900 whitespace-pre-wrap">{item.prompt}</div>

        {item.kind === 'coding' ? (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            <div className="font-bold mb-1">⚡ Coding challenge (optional)</div>
            <div>
              Live coding rounds are still being wired into the diagnostic. Click{' '}
              <b>Skip coding</b> to finish the test — your coding level will stay unranked
              for now, and you can take a coding round from the AI Interview page any time.
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {(item.options || []).map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setChosen(i)}
                className={`text-left p-3.5 rounded-xl border-2 transition font-medium text-sm ${
                  chosen === i
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                }`}
              >
                <span className="inline-block w-6 font-black text-gray-400 mr-1">
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {item.kind === 'coding' ? (
          <button
            onClick={() => recordAndAdvance(undefined)}
            className="flex-1 py-3 rounded-xl font-black text-white bg-amber-500 hover:bg-amber-600 transition"
          >
            Skip coding →
          </button>
        ) : (
          <button
            onClick={() => recordAndAdvance(chosen ?? undefined)}
            disabled={chosen === null}
            className="flex-1 py-3 rounded-xl font-black text-white bg-indigo-600 disabled:opacity-40 hover:bg-indigo-700 transition"
          >
            {idx + 1 === total ? 'Submit test' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  );
};
