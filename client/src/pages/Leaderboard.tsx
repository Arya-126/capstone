import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../services/api';

interface LeaderboardUser {
  id: string;
  name: string;
  level: number;
  xpTotal: number;
  streakDays: number;
  rank?: number;
}
interface LeaderboardData {
  leaderboard: LeaderboardUser[];
  currentUser: LeaderboardUser | null;
  scope?: string;
  needsCohort?: boolean;
}
type Scope = 'global' | 'cohort' | 'friends';

const TABS: { key: Scope; label: string }[] = [
  { key: 'global', label: '🌍 Global' },
  { key: 'cohort', label: '🎓 My College' },
  { key: 'friends', label: '👥 Friends' },
];

export const LeaderboardPage: React.FC = () => {
  const [scope, setScope] = useState<Scope>('global');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<LeaderboardData>(`/leaderboard?scope=${scope}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [scope]);
  useEffect(load, [load]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-8 rounded-lg shadow-lg text-white mb-6">
        <h2 className="text-4xl font-bold text-center mb-2">🏆 Leaderboard</h2>
        <p className="text-center text-yellow-100">Ranked by Total XP</p>
      </div>

      {/* scope tabs */}
      <div className="flex gap-2 mb-6 justify-center">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`px-5 py-2 rounded-full font-bold text-sm transition ${
              scope === t.key ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-indigo-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === 'cohort' && data?.needsCohort && <JoinCohort onJoined={load} />}
      {scope === 'friends' && <FriendsPanel onChanged={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : !data ? (
        <div className="text-center py-12 text-gray-500">Failed to load leaderboard</div>
      ) : (
        <>
          {data.currentUser && (
            <div className="bg-indigo-50 border-2 border-indigo-200 p-4 rounded-lg shadow mb-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-xl">
                #{data.currentUser.rank}
              </div>
              <div>
                <p className="font-bold text-lg text-indigo-900">Your Rank</p>
                <p className="text-sm text-indigo-700">
                  Level {data.currentUser.level} • {data.currentUser.xpTotal.toLocaleString()} XP • 🔥 {data.currentUser.streakDays}
                </p>
              </div>
            </div>
          )}

          {data.leaderboard.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
              {scope === 'cohort'
                ? 'Join a college to see its leaderboard.'
                : scope === 'friends'
                  ? 'Add friends to compare your XP.'
                  : 'No one on the leaderboard yet.'}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">Rank</th>
                    <th className="px-6 py-4 font-semibold text-gray-600">Student</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-right">Streak</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-right">XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.leaderboard.map((user, idx) => {
                    const rank = idx + 1;
                    const isMe = data.currentUser?.id === user.id;
                    let badge: React.ReactNode = <span className="text-gray-500 font-bold">#{rank}</span>;
                    if (rank === 1) badge = <span className="text-2xl">🥇</span>;
                    if (rank === 2) badge = <span className="text-2xl">🥈</span>;
                    if (rank === 3) badge = <span className="text-2xl">🥉</span>;
                    return (
                      <tr key={user.id} className={`hover:bg-gray-50 ${isMe ? 'bg-indigo-50/50' : ''}`}>
                        <td className="px-6 py-4 w-24 text-center">{badge}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center font-bold">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">
                                {user.name} {isMe && '(You)'}
                              </p>
                              <p className="text-xs text-gray-500 uppercase">Level {user.level}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {user.streakDays > 0 ? (
                            <span className="font-bold text-orange-500">🔥 {user.streakDays}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-indigo-600">
                          {user.xpTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---- join-college widget (shown on the College tab when not in a cohort) ----
const JoinCohort: React.FC<{ onJoined: () => void }> = ({ onJoined }) => {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const join = async () => {
    setMsg(null);
    try {
      const r = await apiClient.post<{ cohort: { name: string } }>('/cohorts/join', { joinCode: code });
      setMsg(`Joined ${r.cohort.name}!`);
      onJoined();
    } catch {
      setMsg('Invalid join code.');
    }
  };
  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h3 className="font-black mb-1">🎓 Join your college</h3>
      <p className="text-sm text-gray-500 mb-3">Enter the join code from your placement cell / educator.</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="JOIN CODE"
          className="flex-1 border rounded-lg px-4 py-2 font-mono tracking-widest"
        />
        <button onClick={join} disabled={!code.trim()} className="px-5 rounded-lg font-black text-white bg-indigo-600 disabled:opacity-40">
          Join
        </button>
      </div>
      {msg && <p className="text-sm mt-2 font-semibold text-indigo-700">{msg}</p>}
    </div>
  );
};

// ---- friends management (shown on the Friends tab) ----
interface FriendLite { id: string; name: string; friendshipId: string }
const FriendsPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [incoming, setIncoming] = useState<FriendLite[]>([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient.get<{ incoming: FriendLite[] }>('/friends').then((d) => setIncoming(d.incoming)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const request = async () => {
    setMsg(null);
    try {
      const r = await apiClient.post<{ status: string }>('/friends/request', { email });
      setMsg(r.status === 'ACCEPTED' ? 'Connected!' : 'Request sent.');
      setEmail('');
      load();
      onChanged();
    } catch {
      setMsg('No user with that email.');
    }
  };
  const accept = async (id: string) => {
    await apiClient.post(`/friends/${id}/accept`, {});
    load();
    onChanged();
  };

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h3 className="font-black mb-1">👥 Friends</h3>
      <div className="flex gap-2 mt-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Add a friend by email"
          className="flex-1 border rounded-lg px-4 py-2"
        />
        <button onClick={request} disabled={!email.trim()} className="px-5 rounded-lg font-black text-white bg-indigo-600 disabled:opacity-40">
          Add
        </button>
      </div>
      {msg && <p className="text-sm mt-2 font-semibold text-indigo-700">{msg}</p>}
      {incoming.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Requests</p>
          {incoming.map((f) => (
            <div key={f.friendshipId} className="flex items-center justify-between py-1">
              <span className="text-sm font-semibold">{f.name}</span>
              <button onClick={() => accept(f.friendshipId)} className="text-xs font-black text-white bg-emerald-600 px-3 py-1 rounded-full">
                Accept
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
