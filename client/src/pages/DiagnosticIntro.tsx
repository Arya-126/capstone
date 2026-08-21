import React, { useState } from 'react';
import { apiClient } from '../services/api';

// First-login diagnostic landing screen. Sells the value ("15 min → we plan
// your prep for you") and offers a Skip so users are never trapped. Per the
// plan the profile stays "Unranked" if they skip — they can come back later.

interface DiagnosticStartResponse {
  attemptId: string;
  items: any[];
  resumed: boolean;
}

const PILLAR_CARDS = [
  { icon: '🧮', title: '8 aptitude', sub: 'Quant · Logical · Verbal' },
  { icon: '🖥️', title: '12 core CS', sub: 'CN · OS · DBMS · SQL' },
  { icon: '⚡', title: '1 coding', sub: 'DSA problem (optional)' },
];

export const DiagnosticIntro: React.FC<{
  onStart: (attemptId: string) => void;
  onSkip: () => void;
}> = ({ onStart, onSkip }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<DiagnosticStartResponse>('/diagnostic/start', {});
      onStart(res.attemptId);
    } catch (e: any) {
      setError(e?.message || 'Could not start the diagnostic — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-white/15 border border-white/30 rounded-full text-xs font-bold uppercase tracking-widest">
            ✨ New here?
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-2">Let's map your starting point</h1>
          <p className="text-indigo-100 font-medium">
            A quick ~15-min diagnostic. We'll grade it instantly, place you on a belt
            (Bronze → Diamond), and build a personalized learning pipeline you can
            follow day by day.
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-3 mb-6">
            {PILLAR_CARDS.map((c) => (
              <div key={c.title} className="text-center bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-2xl mb-1">{c.icon}</div>
                <div className="font-black text-sm text-gray-900">{c.title}</div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{c.sub}</div>
              </div>
            ))}
          </div>

          <ul className="text-sm text-gray-600 space-y-2 mb-6">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
              <span>21 questions, ~15 minutes. One at a time, 60 sec each.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
              <span>Instant results — see your per-pillar level and overall belt.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
              <span>Skippable — you can take it later from the Prep Tracker.</span>
            </li>
          </ul>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={start}
              disabled={busy}
              className="flex-1 py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow hover:opacity-95 transition disabled:opacity-40"
            >
              {busy ? 'Preparing your test…' : '🚀 Start Diagnostic'}
            </button>
            <button
              onClick={onSkip}
              disabled={busy}
              className="py-3.5 px-6 rounded-xl font-bold text-gray-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-40"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
