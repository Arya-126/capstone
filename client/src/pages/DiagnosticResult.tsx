import React from 'react';
import type { DiagnosticResultPayload } from './DiagnosticTest';

// Post-diagnostic reveal — belt badge, per-pillar levels, subtopic breakdown,
// and a big CTA to continue. No pipeline generation yet (Sprint C), so the
// "Continue" button just drops the user on the Prep Tracker for now.

const BELT_STYLES: Record<string, { grad: string; ring: string; label: string; icon: string }> = {
  Unranked: { grad: 'from-slate-400 to-slate-600', ring: 'ring-slate-300', label: 'Unranked', icon: '🎯' },
  Bronze: { grad: 'from-orange-500 to-amber-700', ring: 'ring-amber-400', label: 'Bronze', icon: '🥉' },
  Silver: { grad: 'from-slate-300 to-slate-500', ring: 'ring-slate-300', label: 'Silver', icon: '🥈' },
  Gold: { grad: 'from-yellow-400 to-amber-500', ring: 'ring-yellow-300', label: 'Gold', icon: '🥇' },
  Platinum: { grad: 'from-cyan-300 to-blue-500', ring: 'ring-cyan-300', label: 'Platinum', icon: '🏆' },
  Diamond: { grad: 'from-fuchsia-400 via-violet-500 to-indigo-600', ring: 'ring-fuchsia-300', label: 'Diamond', icon: '💎' },
};

const PILLAR_META: Record<string, { icon: string; name: string }> = {
  aptitude: { icon: '🧮', name: 'Aptitude' },
  coreCS: { icon: '🖥️', name: 'Core CS' },
  coding: { icon: '⚡', name: 'Coding' },
};

const LEVEL_LABELS = ['Undiagnosed', 'Foundations', 'Novice', 'Intermediate', 'Proficient', 'Advanced'];

export const DiagnosticResult: React.FC<{
  result: DiagnosticResultPayload;
  onContinue: () => void;
}> = ({ result, onContinue }) => {
  const belt = BELT_STYLES[result.overallBelt] || BELT_STYLES.Unranked;

  return (
    <div className="max-w-3xl mx-auto py-8 animate-fade-in">
      {/* Belt banner */}
      <div
        className={`bg-gradient-to-br ${belt.grad} text-white rounded-2xl shadow-xl p-8 text-center mb-6 relative overflow-hidden`}
      >
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-white/15 border border-white/30 rounded-full text-xs font-bold uppercase tracking-widest">
            Your starting belt
          </div>
          <div className="text-7xl mb-2">{belt.icon}</div>
          <div className="text-4xl md:text-5xl font-black tracking-tight">{belt.label}</div>
          <div className="text-sm font-medium text-white/80 mt-2">
            Great start — we've mapped your baseline. Now let's climb.
          </div>
        </div>
      </div>

      {/* Per-pillar levels */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {(['aptitude', 'coreCS', 'coding'] as const).map((pillar) => {
          const lvl = result.levelsAwarded[pillar] || 0;
          const score = result.perPillarScores[pillar] || 0;
          const meta = PILLAR_META[pillar];
          return (
            <div key={pillar} className="bg-white p-5 rounded-2xl shadow border border-gray-100">
              <div className="text-2xl mb-1">{meta.icon}</div>
              <div className="font-black text-gray-900">{meta.name}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                Level {lvl}/5
              </div>
              <div className="text-sm font-bold text-indigo-600 mt-0.5">
                {LEVEL_LABELS[lvl] || 'Undiagnosed'}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
                <div
                  className="bg-gradient-to-r from-indigo-400 to-violet-600 h-2 rounded-full transition-all"
                  style={{ width: `${(lvl / 5) * 100}%` }}
                />
              </div>
              <div className="text-[10px] font-semibold text-gray-400 mt-1.5">
                Score: {(score * 100).toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtopic breakdown */}
      {Object.keys(result.breakdown || {}).length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 mb-6">
          <div className="font-black text-gray-900 mb-3">Where you stand by topic</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.breakdown).map(([subtopic, level]) => {
              const color =
                level >= 4
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : level >= 3
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : level >= 2
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-red-50 text-red-700 border-red-200';
              return (
                <span
                  key={subtopic}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${color}`}
                >
                  {subtopic}
                  <span className="opacity-75">L{level}</span>
                </span>
              );
            })}
          </div>
          <div className="text-[10px] text-gray-400 mt-3">
            Red L1 = Foundations, amber L2 = Novice, blue L3 = Intermediate, green L4+ = Proficient/Advanced.
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-2xl font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-lg hover:opacity-95 transition text-lg"
      >
        Continue to your dashboard →
      </button>
      <div className="text-xs text-center text-gray-400 mt-3">
        Your personalized learning pipeline is coming soon. For now, jump into any prep module
        from the sidebar — your progress here already shapes what gets recommended.
      </div>
    </div>
  );
};
