import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// Coding practice tracks: overall progress bar + one card per track with a
// percent ring, a horizontal level node chain (✅ complete / ○ incomplete),
// and the problem rows inside the expanded level. Data: GET /coding-tracks.

interface TrackProblem {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  status: 'SOLVED' | 'ATTEMPTED' | 'UNATTEMPTED';
  bestScore: number;
}

interface TrackLevel {
  level: number;
  solved: number;
  total: number;
  complete: boolean;
  problems: TrackProblem[];
}

interface Track {
  track: string;
  name: string;
  solved: number;
  total: number;
  percent: number;
  levels: TrackLevel[];
}

interface TracksResponse {
  tracks: Track[];
  overall: { solved: number; total: number; percent: number };
}

const DIFF_CHIP: Record<string, string> = {
  EASY: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HARD: 'bg-rose-100 text-rose-700',
};

const statusIcon = (s: TrackProblem['status']) =>
  s === 'SOLVED' ? '✅' : s === 'ATTEMPTED' ? '🟡' : '○';

const Ring: React.FC<{ percent: number }> = ({ percent }) => {
  const r = 20;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="900" fill="#374151">
        {percent}%
      </text>
    </svg>
  );
};

export const CodingTracks: React.FC<{
  onBack: () => void;
  onOpenProblem: (slug: string) => void;
}> = ({ onBack, onOpenProblem }) => {
  const [data, setData] = useState<TracksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // per-track: which level's problem list is expanded
  const [open, setOpen] = useState<Record<string, number | null>>({});

  useEffect(() => {
    apiClient
      .get<TracksResponse>('/coding-tracks')
      .then((d) => {
        setData(d);
        const o: Record<string, number | null> = {};
        for (const t of d.tracks) {
          const firstIncomplete = t.levels.find((l) => !l.complete);
          o[t.track] = firstIncomplete ? firstIncomplete.level : t.levels[0]?.level ?? null;
        }
        setOpen(o);
      })
      .catch((e) => setError(e?.message || 'Failed to load coding tracks'));
  }, []);

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
  if (!data) {
    return <div className="text-gray-500 italic p-12 text-center">Loading coding tracks…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* header + overall progress */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="bg-white shadow rounded-lg px-3 py-2 font-bold text-sm hover:bg-gray-50"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-black">💻 Coding Tracks</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <span className="font-black text-sm text-gray-700">Overall progress</span>
          <span className="text-sm font-bold text-gray-500">
            {data.overall.solved} / {data.overall.total} solved · {data.overall.percent}%
          </span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
            style={{ width: `${data.overall.percent}%` }}
          />
        </div>
      </div>

      {data.tracks.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500 italic">
          No coding tracks available yet — check back soon.
        </div>
      )}

      {/* one card per track */}
      <div className="space-y-4">
        {data.tracks.map((t) => {
          const openLevel = open[t.track] ?? null;
          return (
            <div key={t.track} className="bg-white rounded-xl shadow p-5">
              <div className="flex items-center gap-4 mb-3">
                <Ring percent={t.percent} />
                <div className="flex-1 min-w-0">
                  <h2 className="font-black text-lg truncate">{t.name}</h2>
                  <p className="text-xs font-bold text-gray-400">
                    {t.solved} / {t.total} solved
                  </p>
                </div>
              </div>

              {/* horizontal level node chain */}
              <div className="flex items-center overflow-x-auto pb-2 mb-1">
                {t.levels.map((lv, i) => (
                  <React.Fragment key={lv.level}>
                    {i > 0 && (
                      <div
                        className={`h-1 w-8 shrink-0 rounded ${
                          t.levels[i - 1].complete ? 'bg-emerald-400' : 'bg-gray-200'
                        }`}
                      />
                    )}
                    <button
                      onClick={() =>
                        setOpen((o) => ({
                          ...o,
                          [t.track]: o[t.track] === lv.level ? null : lv.level,
                        }))
                      }
                      title={`Level ${lv.level}: ${lv.solved}/${lv.total} solved`}
                      className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 transition ${
                        openLevel === lv.level
                          ? 'border-indigo-600 bg-indigo-50'
                          : lv.complete
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-gray-200 bg-white hover:border-indigo-300'
                      }`}
                    >
                      <span className="text-base leading-none">{lv.complete ? '✅' : '○'}</span>
                      <span className="text-[10px] font-black text-gray-500 mt-0.5">
                        L{lv.level}
                      </span>
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* problem rows for the expanded level */}
              {t.levels
                .filter((lv) => lv.level === openLevel)
                .map((lv) => (
                  <div key={lv.level} className="mt-2 border-t pt-3">
                    <div className="text-xs font-black text-gray-400 uppercase mb-2">
                      Level {lv.level} · {lv.solved}/{lv.total} solved
                      {lv.complete ? ' · complete 🎉' : ''}
                    </div>
                    <div className="space-y-1.5">
                      {lv.problems.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => onOpenProblem(p.slug)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 text-left transition"
                        >
                          <span className="w-6 text-center">{statusIcon(p.status)}</span>
                          <span className="flex-1 font-semibold text-sm truncate">{p.title}</span>
                          {p.status !== 'UNATTEMPTED' && (
                            <span className="text-xs font-bold text-gray-400">
                              best {Math.round(p.bestScore)}%
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              DIFF_CHIP[p.difficulty] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {p.difficulty}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
