import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Contest {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: 'UPCOMING' | 'LIVE' | 'ENDED';
  durationMinutes: number;
  mode: string;
  cohort: string | null;
}
interface RankRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  durationUsedSec: number;
}

function countdown(toIso: string): string {
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

export const ContestsHub: React.FC<{
  onBack: () => void;
  onStart: (testId: string) => void;
}> = ({ onBack, onStart }) => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<{ contest: Contest; rows: RankRow[]; mine: RankRow | null } | null>(null);
  const [, setTick] = useState(0); // re-render for live countdowns

  useEffect(() => {
    apiClient
      .get<Contest[]>('/contests')
      .then(setContests)
      .catch(() => setError('Failed to load contests'))
      .finally(() => setLoading(false));
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const enter = async (c: Contest) => {
    setBusy(c.id);
    setError(null);
    try {
      const { testId } = await apiClient.post<{ testId: string }>(`/contests/${c.slug}/start`, {});
      onStart(testId);
    } catch {
      setError('Could not enter the contest — it may not be live.');
    } finally {
      setBusy(null);
    }
  };

  const viewResults = async (c: Contest) => {
    setBusy(c.id);
    try {
      const d = await apiClient.get<{ leaderboard: RankRow[]; currentUser: RankRow | null }>(
        `/contests/${c.slug}/leaderboard`
      );
      setResults({ contest: c, rows: d.leaderboard, mine: d.currentUser });
    } catch {
      setError('Could not load results.');
    } finally {
      setBusy(null);
    }
  };

  const live = contests.filter((c) => c.status === 'LIVE');
  const upcoming = contests.filter((c) => c.status === 'UPCOMING');
  const past = contests.filter((c) => c.status === 'ENDED');

  const Card = (c: Contest) => (
    <div key={c.id} className="bg-white rounded-xl shadow p-5 flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-black text-lg">{c.title}</h3>
        <span
          className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${
            c.status === 'LIVE'
              ? 'bg-emerald-100 text-emerald-700'
              : c.status === 'UPCOMING'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
          }`}
        >
          {c.status}
        </span>
      </div>
      {c.description && <p className="text-sm text-gray-600 mb-2">{c.description}</p>}
      <p className="text-xs text-gray-500 mb-3">
        ⏱ {c.durationMinutes} min · {c.mode}
        {c.cohort ? ` · ${c.cohort} only` : ' · open'}
        {c.status === 'LIVE' && <> · ends in <b>{countdown(c.endsAt)}</b></>}
        {c.status === 'UPCOMING' && <> · starts in <b>{countdown(c.startsAt)}</b></>}
      </p>
      <div className="mt-auto">
        {c.status === 'LIVE' && (
          <button
            onClick={() => enter(c)}
            disabled={busy === c.id}
            className="w-full py-2 rounded-lg font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-50"
          >
            {busy === c.id ? 'Entering…' : '⚡ Enter contest'}
          </button>
        )}
        {c.status === 'UPCOMING' && (
          <button disabled className="w-full py-2 rounded-lg font-bold bg-gray-100 text-gray-400">
            Starts in {countdown(c.startsAt)}
          </button>
        )}
        {c.status === 'ENDED' && (
          <button
            onClick={() => viewResults(c)}
            disabled={busy === c.id}
            className="w-full py-2 rounded-lg font-black text-white bg-indigo-600 disabled:opacity-50"
          >
            🏆 View results
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-bold mb-4">
        ← Back to Dashboard
      </button>
      <h1 className="text-3xl font-black mb-6">🏁 Contests</h1>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
      {loading && <div className="text-gray-500 italic p-8 text-center">Loading…</div>}

      {!loading && contests.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          No contests yet. Check back soon!
        </div>
      )}

      {live.length > 0 && (
        <section className="mb-8">
          <h2 className="font-black text-lg mb-3 text-emerald-700">🟢 Live now</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{live.map(Card)}</div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="font-black text-lg mb-3 text-amber-700">⏳ Upcoming</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{upcoming.map(Card)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mb-8">
          <h2 className="font-black text-lg mb-3 text-gray-600">✅ Past</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{past.map(Card)}</div>
        </section>
      )}

      {/* results modal */}
      {results && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setResults(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-black text-xl">🏆 {results.contest.title}</h2>
              <button onClick={() => setResults(null)} className="text-gray-400 font-black text-xl">✕</button>
            </div>
            {results.mine && (
              <div className="bg-indigo-50 rounded-lg p-3 mb-4 text-sm font-bold text-indigo-800">
                Your rank: #{results.mine.rank} · {results.mine.score}% · {fmtDur(results.mine.durationUsedSec)}
              </div>
            )}
            {results.rows.length === 0 ? (
              <p className="text-gray-500 text-center py-6">No submissions.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-500 border-b">
                  <tr><th className="text-left py-2">#</th><th className="text-left">Name</th><th className="text-right">Score</th><th className="text-right">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.rows.map((r) => (
                    <tr key={r.userId} className={results.mine?.userId === r.userId ? 'bg-indigo-50/50' : ''}>
                      <td className="py-2 font-bold">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`}</td>
                      <td>{r.name}</td>
                      <td className="text-right font-bold text-indigo-600">{r.score}%</td>
                      <td className="text-right text-gray-500">{fmtDur(r.durationUsedSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
