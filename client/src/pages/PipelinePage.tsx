import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// Personalized learning pipeline dashboard. The current stage sits front-and-
// center with a big CTA; upcoming stages are dimmed and locked; completed
// stages compress into a strip at the top. Clicking a CTA deep-links into
// the target page (quiz / coding / interview) with the right context.

interface Stage {
  id: string;
  order: number;
  pillar: string;      // "aptitude" | "coreCS" | "coding" | "comm"
  level: number;
  title: string;
  description: string;
  gateType: string;    // "quiz" | "coding-solve" | "interview" | "theory-read"
  gateMeta: any;
  isUnlocked: boolean;
  isCompleted: boolean;
  isSkipped: boolean;
  skippedAt: string | null;
  completedAt: string | null;
}

interface Pipeline {
  id: string;
  status: string;
  focus: string;
  targetCompany: string | null;
  stages: Stage[];
  createdAt: string;
}

const PILLAR_ICON: Record<string, string> = {
  aptitude: '🧮',
  coreCS: '🖥️',
  coding: '⚡',
  comm: '🗣️',
};
const PILLAR_LABEL: Record<string, string> = {
  aptitude: 'Aptitude',
  coreCS: 'Core CS',
  coding: 'Coding',
  comm: 'Interview',
};

// Map gateType + meta → { label, targetPage } so the CTA does the right thing
function ctaFor(stage: Stage): { label: string; targetPage: string; extra?: Record<string, string> } {
  const m = stage.gateMeta || {};
  if (stage.gateType === 'quiz') {
    if (m.source === 'core-subject') {
      return {
        label: `Take ${m.subject} quiz →`,
        targetPage: 'core-cs-hub',
        extra: { subject: m.subject },
      };
    }
    return {
      label: `Take ${m.subtopic || 'aptitude'} quiz →`,
      targetPage: 'interview-hub',
      extra: { categorySlug: m.categorySlug || '' },
    };
  }
  if (stage.gateType === 'coding-solve') {
    return {
      label: `Solve ${m.topicSlug || 'DSA'} problems →`,
      targetPage: 'coding-tracks',
      extra: { topicSlug: m.topicSlug || '' },
    };
  }
  if (stage.gateType === 'interview') {
    return {
      label: `Start ${m.roundType || ''} mock →`,
      targetPage: 'ai-interview',
      extra: { roundType: m.roundType || 'technical' },
    };
  }
  return { label: 'Open →', targetPage: 'dashboard' };
}

const gateReqText = (stage: Stage): string => {
  const m = stage.gateMeta || {};
  if (stage.gateType === 'quiz') return `Score ≥ ${m.minScore ?? 70}% on the quiz`;
  if (stage.gateType === 'coding-solve') return `Solve ${m.minSolved ?? 1} problem(s)`;
  if (stage.gateType === 'interview') return `Score ≥ ${m.minOverallScore ?? 60}/100`;
  return '';
};

export const PipelinePage: React.FC<{
  onNavigate: (page: string, ctx?: Record<string, string>) => void;
  onNoDiagnostic: () => void;
}> = ({ onNavigate, onNoDiagnostic }) => {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient
      .get<Pipeline | null>('/pipeline/current')
      .then((p) => {
        setPipeline(p);
        setError(null);
      })
      .catch(() => setError('Failed to load pipeline.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createFresh = async (focus: string) => {
    setBusy(true);
    try {
      await apiClient.post('/pipeline/create', { focus });
      load();
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('diagnostic')) {
        onNoDiagnostic();
      } else {
        setError(msg || 'Failed to generate pipeline.');
      }
    } finally {
      setBusy(false);
    }
  };

  const skipStage = async (stageId: string) => {
    if (!pipeline) return;
    if (!confirm(
      "This stage will be marked as MISSED — not completed. It stays on your pipeline and you can come back to complete it any time. Skip for now?"
    )) return;
    try {
      await apiClient.post(`/pipeline/${pipeline.id}/skip-stage/${stageId}`, {});
      load();
    } catch {
      setError('Failed to skip stage.');
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-gray-500 animate-pulse">Loading your pipeline…</div>;
  }

  // No pipeline yet — offer to generate one or point to the diagnostic
  if (!pipeline) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="bg-white p-8 rounded-2xl shadow text-center">
          <div className="text-5xl mb-3">🎯</div>
          <h1 className="text-2xl font-black mb-2">No active pipeline</h1>
          <p className="text-gray-600 mb-5">
            Generate a personalized roadmap based on your skill profile. Pick a preset:
          </p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-3 text-sm">{error}</div>}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { focus: 'balanced', title: 'Balanced', desc: 'Touches all pillars — ~4 weeks' },
              { focus: 'placement-6w', title: 'Placement 6-week', desc: 'Frontloads CS + coding' },
              { focus: 'coding-only', title: 'Coding-only', desc: 'DSA ladder, all coding' },
            ].map((preset) => (
              <button
                key={preset.focus}
                onClick={() => createFresh(preset.focus)}
                disabled={busy}
                className="p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 text-left transition disabled:opacity-40"
              >
                <div className="font-black text-gray-900 text-sm">{preset.title}</div>
                <div className="text-xs text-gray-500 mt-1">{preset.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Three real states: completed (isCompleted), missed (isSkipped && !isCompleted),
  // pending (neither). "Current" is the first unlocked non-completed non-skipped
  // stage — the one the user is actively expected to work on next.
  const completed = pipeline.stages.filter((s) => s.isCompleted);
  const missed = pipeline.stages.filter((s) => s.isSkipped && !s.isCompleted);
  const pending = pipeline.stages.filter((s) => !s.isCompleted && !s.isSkipped);
  const current = pending.find((s) => s.isUnlocked) || null;
  const locked = pending.filter((s) => !s.isUnlocked);
  const pct = Math.round((completed.length / pipeline.stages.length) * 100);

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-indigo-200">
              Your learning pipeline · {pipeline.focus}
            </div>
            <h1 className="text-3xl font-black">
              {completed.length} / {pipeline.stages.length} stages — {pct}% complete
            </h1>
            {missed.length > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/25 border border-amber-200/50 text-amber-100 text-xs font-bold">
                ⚠ {missed.length} missed — go back and complete
              </div>
            )}
          </div>
          <button
            onClick={() => createFresh(pipeline.focus)}
            disabled={busy}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/15 border border-white/40 hover:bg-white/25 transition"
          >
            ↻ Regenerate
          </button>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

      {/* Completed strip */}
      {completed.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
            Completed ({completed.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {completed.map((s) => (
              <div
                key={s.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
                title={s.title}
              >
                <span>{PILLAR_ICON[s.pillar]}</span>
                <span className="truncate max-w-[220px]">{s.title}</span>
                <span className="opacity-60">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current stage — the big card */}
      {current ? (
        <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-indigo-500 mb-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 mb-2">
            <span className="animate-pulse">●</span> Current stage · Stage {current.order}
          </div>
          <div className="flex items-start gap-4 mb-4">
            <div className="text-4xl">{PILLAR_ICON[current.pillar]}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-gray-900">{current.title}</h2>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                {PILLAR_LABEL[current.pillar]} · Target level {current.level}
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-3">{current.description}</p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-700 mb-4">
            🎯 Gate: {gateReqText(current)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const cta = ctaFor(current);
                onNavigate(cta.targetPage, cta.extra);
              }}
              className="flex-1 py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 transition shadow"
            >
              {ctaFor(current).label}
            </button>
            <button
              onClick={() => skipStage(current.id)}
              className="px-4 rounded-xl font-bold text-gray-600 bg-slate-100 hover:bg-slate-200 transition text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-8 text-center mb-6">
          <div className="text-5xl mb-2">🎉</div>
          <div className="text-2xl font-black text-emerald-800">Pipeline complete!</div>
          <div className="text-sm text-emerald-700 mt-1">
            You've walked every stage. Retake the diagnostic for a fresh, harder ladder.
          </div>
        </div>
      )}

      {/* Missed stages — user skipped these but they still count against progress */}
      {missed.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
            <span>⚠ Missed ({missed.length})</span>
            <span className="text-[10px] font-semibold text-gray-500 normal-case tracking-normal">
              These don't count as complete — go back and finish them
            </span>
          </div>
          <div className="space-y-2">
            {missed.map((s) => {
              const cta = ctaFor(s);
              return (
                <div
                  key={s.id}
                  className="bg-amber-50 p-4 rounded-xl border-2 border-amber-300 flex items-center gap-3"
                >
                  <div className="text-2xl">{PILLAR_ICON[s.pillar]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-amber-900 text-sm truncate">
                      Stage {s.order} · {s.title}
                    </div>
                    <div className="text-xs text-amber-700">{gateReqText(s)}</div>
                  </div>
                  <button
                    onClick={() => onNavigate(cta.targetPage, cta.extra)}
                    className="px-4 py-2 rounded-lg font-black text-white bg-amber-600 hover:bg-amber-700 transition text-xs whitespace-nowrap"
                  >
                    Complete now →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming stages */}
      {locked.length > 0 && (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">
            Upcoming ({locked.length})
          </div>
          <div className="space-y-2">
            {locked.slice(0, 6).map((s) => (
              <div
                key={s.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 opacity-70 flex items-center gap-3"
              >
                <div className="text-2xl grayscale">{PILLAR_ICON[s.pillar]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-gray-700 text-sm truncate">
                    Stage {s.order} · {s.title}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{gateReqText(s)}</div>
                </div>
                <div className="text-xs font-bold text-gray-400">🔒 Locked</div>
              </div>
            ))}
            {locked.length > 6 && (
              <div className="text-center text-xs text-gray-400 pt-2">
                + {locked.length - 6} more stages ahead
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
