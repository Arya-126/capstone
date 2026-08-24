import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// Shared comprehensive-report page. Used from every finish screen —
// after aptitude quiz, core-CS quiz, AI interview, coding round.
// See plan-comprehensive-reports.md Part B.

interface PerQuestion {
  questionId: string;
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  conceptTag: string;
  subject: string;
}
interface WeakConcept {
  concept: string;
  subject: string;
  missCount: number;
  missedQuestionIds: string[];
}
interface StrongConcept {
  concept: string;
  subject: string;
  correctCount: number;
}
interface Report {
  id: string;
  sourceType: string;
  sourceId: string;
  overallScore: number;
  perQuestion: PerQuestion[];
  weakConcepts: WeakConcept[];
  strongConcepts: StrongConcept[];
  createdAt: string;
}

interface Synopsis {
  subject: string;
  concept: string;
  synopsis: string;
  bulletKeys: string[];
  commonMistakes: string | null;
  recommendedGames: { gameType: string; reason: string }[];
}

const SOURCE_LABEL: Record<string, string> = {
  'aptitude-quiz': '🧮 Aptitude Quiz',
  'core-cs-quiz': '🖥️ Core CS Quiz',
  'ai-interview': '🤖 AI Interview',
  'coding-round': '⚡ Coding Round',
};

// One synopsis card — fetches on mount, shows loading state, then bullets +
// prose + common-mistake callout + recommended-game chips
const ConceptCard: React.FC<{
  weak: WeakConcept;
  onPractice: () => void;
  onReadTheory?: () => void;
}> = ({ weak, onPractice, onReadTheory }) => {
  const [syn, setSyn] = useState<Synopsis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Synopsis>(`/reports/synopsis/${encodeURIComponent(weak.subject)}/${encodeURIComponent(weak.concept)}`)
      .then((s) => { if (!cancelled) setSyn(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weak.subject, weak.concept]);

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">
            {weak.subject} · {weak.missCount} miss{weak.missCount > 1 ? 'es' : ''}
          </div>
          <h3 className="text-lg font-black text-gray-900">{weak.concept}</h3>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse text-xs text-gray-400">Loading synopsis…</div>
      ) : syn ? (
        <>
          {syn.bulletKeys.length > 0 && (
            <ul className="space-y-1 mb-3">
              {syn.bulletKeys.map((b, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-emerald-500 font-bold mt-0.5">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {expanded && (
            <p className="text-sm text-gray-600 leading-relaxed mb-3 whitespace-pre-wrap">
              {syn.synopsis}
            </p>
          )}
          {!expanded && syn.synopsis && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs font-bold text-indigo-600 hover:underline mb-3"
            >
              Read full synopsis →
            </button>
          )}
          {syn.commonMistakes && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-800 mb-3">
              <b>⚠ Common mistake:</b> {syn.commonMistakes}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-gray-400 italic mb-3">
          (Synopsis will appear here once generated.)
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={onPractice}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
        >
          ▶ Practice this
        </button>
        {onReadTheory && (
          <button
            onClick={onReadTheory}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
          >
            📖 Read theory
          </button>
        )}
        {syn?.recommendedGames?.slice(0, 2).map((g) => (
          <span
            key={g.gameType}
            className="px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-bold"
            title={g.reason}
          >
            🎮 {g.gameType.replace(/_/g, ' ').toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
};

const QuestionReview: React.FC<{ q: PerQuestion }> = ({ q }) => {
  const [expanded, setExpanded] = useState(false);
  const bg = q.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200';
  return (
    <div className={`rounded-xl border p-3 mb-2 ${bg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start justify-between gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
            {q.isCorrect ? '✓ Correct' : '✗ Wrong'} · {q.conceptTag}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">{q.prompt}</div>
        </div>
        <span className="text-xs text-gray-400 mt-0.5">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          <div>
            <span className="font-bold text-gray-500">Your answer: </span>
            <span className={q.isCorrect ? 'text-emerald-700' : 'text-red-700'}>{q.userAnswer}</span>
          </div>
          {!q.isCorrect && (
            <div>
              <span className="font-bold text-gray-500">Correct answer: </span>
              <span className="text-emerald-700">{q.correctAnswer}</span>
            </div>
          )}
          {q.explanation && (
            <div className="bg-white/70 border border-gray-200 rounded p-2 text-gray-700">
              <b>Why:</b> {q.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TestReport: React.FC<{
  reportId: string;
  onBack: () => void;
  onNavigate: (page: string, ctx?: Record<string, string>) => void;
}> = ({ reportId, onBack, onNavigate }) => {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [inject, setInject] = useState<{ busy: boolean; result: string | null }>({
    busy: false, result: null,
  });

  const injectIntoPipeline = async () => {
    setInject({ busy: true, result: null });
    try {
      const res = await apiClient.post<{ added: number; skipped: number }>(
        `/pipeline/current/inject-from-report/${reportId}`,
        {},
      );
      const parts: string[] = [];
      if (res.added > 0) parts.push(`Added ${res.added} stage${res.added > 1 ? 's' : ''} to your pipeline.`);
      if (res.skipped > 0) parts.push(`${res.skipped} already covered.`);
      if (parts.length === 0) parts.push('No new stages needed — everything is already on your pipeline.');
      setInject({ busy: false, result: parts.join(' ') });
    } catch (e: any) {
      const msg = e?.message || 'Failed';
      // The most common failure: no active pipeline. Send them there to create one.
      if (msg.toLowerCase().includes('no active pipeline')) {
        setInject({ busy: false, result: 'No active pipeline yet — go to My Pipeline to generate one first.' });
      } else {
        setInject({ busy: false, result: msg });
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Report>(`/reports/${reportId}`)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setError('Failed to load report.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportId]);

  if (loading) return <div className="text-center py-16 text-gray-400 animate-pulse">Loading report…</div>;
  if (error || !report) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4">
          {error || 'Report unavailable.'}
        </div>
        <button onClick={onBack} className="text-sm font-bold text-indigo-600">← Back</button>
      </div>
    );
  }

  const pct = Math.round(report.overallScore);
  const scoreColor = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
  const misses = report.perQuestion.filter((q) => !q.isCorrect);
  const visibleQs = showAll ? report.perQuestion : misses;

  return (
    <div className="max-w-3xl mx-auto py-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-indigo-600">
            {SOURCE_LABEL[report.sourceType] || report.sourceType}
          </div>
          <h1 className="text-3xl font-black text-gray-900">Comprehensive Report</h1>
          <div className="text-xs text-gray-500 mt-1">
            {new Date(report.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-5xl font-black ${scoreColor}`}>{pct}</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">/ 100</div>
        </div>
      </div>

      {/* Weak concepts (top — the most valuable part) */}
      {report.weakConcepts.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-amber-700 mb-3">
            ⚠ Focus areas ({report.weakConcepts.length})
          </div>
          {report.weakConcepts.map((w) => (
            <ConceptCard
              key={`${w.subject}::${w.concept}`}
              weak={w}
              onPractice={() => {
                // For MVP: aptitude/CS → their hubs; interviews → ai-interview
                const target =
                  w.subject === 'CN' || w.subject === 'OS' || w.subject === 'DBMS' || w.subject === 'SQL'
                    ? 'core-cs-hub'
                    : w.subject === 'HR'
                    ? 'hr-prep'
                    : w.subject === 'DSA'
                    ? 'coding-tracks'
                    : 'interview-hub';
                onNavigate(target, { subject: w.subject });
              }}
            />
          ))}
        </div>
      )}

      {/* Add weak concepts to the pipeline in one shot */}
      {report.weakConcepts.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🎯</div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-gray-900 mb-1">Push these into your pipeline</div>
              <div className="text-xs text-gray-600 mb-3">
                Add one stage per weak concept to your active pipeline. Each stage's gate reinforces
                the concept — quiz for MCQ, coding for DSA, mock for HR — and unlocks the next.
              </div>
              {inject.result && (
                <div className="bg-white border border-indigo-200 rounded-lg p-2.5 text-xs font-bold text-indigo-900 mb-3">
                  {inject.result}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={injectIntoPipeline}
                  disabled={inject.busy}
                  className="px-4 py-2 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700 transition text-xs disabled:opacity-50"
                >
                  {inject.busy ? 'Adding…' : `➕ Add ${report.weakConcepts.length} to pipeline`}
                </button>
                <button
                  onClick={() => onNavigate('pipeline')}
                  className="px-4 py-2 rounded-lg font-bold text-indigo-700 bg-white border border-indigo-200 hover:border-indigo-400 transition text-xs"
                >
                  Open pipeline →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Strengths (quiet, at the bottom of weak-concepts) */}
      {report.strongConcepts.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-2">
            💪 Strengths
          </div>
          <div className="flex flex-wrap gap-2">
            {report.strongConcepts.map((s) => (
              <span
                key={`${s.subject}::${s.concept}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
              >
                {s.concept}
                <span className="opacity-60">× {s.correctCount}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-question review — collapsed misses first, toggle for all */}
      {report.perQuestion.length > 0 && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs font-black uppercase tracking-widest text-gray-500">
              Question review
            </div>
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              {showAll ? 'Hide correct answers' : `Show all ${report.perQuestion.length} questions`}
            </button>
          </div>
          {visibleQs.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 text-center">
              🎉 Perfect run — no mistakes to review.
            </div>
          ) : (
            visibleQs.map((q) => <QuestionReview key={q.questionId} q={q} />)
          )}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition"
      >
        Back to Dashboard
      </button>
    </div>
  );
};
