import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface SidebarData {
  xpTotal: number;
  level: number;
  streakDays: number;
  rank: number;
  codingSolved: number;
  codingTotal: number;
  weakTopics: { name: string; score: number }[];
  miniLeaderboard: { name: string; xpTotal: number; isMe: boolean }[];
}

export const StatsSidebar: React.FC = () => {
  const [data, setData] = useState<SidebarData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiClient
      .get<SidebarData>('/leaderboard/sidebar')
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) {
    return (
      <aside className="w-72 shrink-0 space-y-4">
        <div className="bg-white rounded-xl shadow p-5 text-center text-sm text-gray-400">
          Loading your stats…
        </div>
      </aside>
    );
  }

  const codingPct =
    data.codingTotal > 0 ? Math.min(100, Math.round((data.codingSolved / data.codingTotal) * 100)) : 0;

  return (
    <aside className="w-72 shrink-0 space-y-4">
      {/* XP / level / streak strip */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl shadow p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-lg">⚡ {data.xpTotal.toLocaleString()} XP</p>
          <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">#{data.rank} global</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-bold">
          <span>🎖️ Level {data.level}</span>
          <span>🔥 {data.streakDays} day streak</span>
        </div>
      </div>

      {/* coding progress */}
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-sm">💻 Coding Progress</h3>
          <span className="text-xs font-bold text-gray-500">
            {data.codingSolved}/{data.codingTotal}
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${codingPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 font-semibold">{codingPct}% of problems solved</p>
      </div>

      {/* weak topics */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-black text-sm mb-3">🎯 Weak topics</h3>
        {data.weakTopics.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-2xl mb-1">🌟</p>
            <p className="text-xs text-gray-500 font-semibold">
              No weak topics detected — keep practicing to stay sharp!
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.weakTopics.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-700 truncate">{t.name}</span>
                <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
                  {t.score}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* mini leaderboard */}
      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-black text-sm mb-3">🏆 Top 5</h3>
        <ul className="space-y-1">
          {data.miniLeaderboard.map((u, i) => (
            <li
              key={`${u.name}-${i}`}
              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg ${
                u.isMe ? 'bg-indigo-50 border border-indigo-200' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-black text-gray-400 w-5">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span
                  className={`text-sm font-bold truncate ${u.isMe ? 'text-indigo-700' : 'text-gray-700'}`}
                >
                  {u.name}
                  {u.isMe && ' (You)'}
                </span>
              </span>
              <span className="text-xs font-black text-indigo-600 shrink-0">
                {u.xpTotal.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};
