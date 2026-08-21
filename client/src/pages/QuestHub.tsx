import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Milestone {
  step: number;
  text: string;
  completed: boolean;
}

interface Quest {
  id: string;
  title: string;
  category: string;
  description: string;
  milestones: Milestone[];
  xpReward: number;
  status: string;
  createdAt: string;
}

export const QuestHub: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuests = async () => {
    try {
      const res = await apiClient.get<{ quests: Quest[] }>('/quests/active');
      setQuests(res.quests || []);
    } catch {
      /* fallback */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuests();
  }, []);

  const toggleMilestone = async (questId: string, stepNum: number) => {
    try {
      const updated = await apiClient.post<Quest>(`/quests/${questId}/milestone/${stepNum}`, {});
      setQuests((prev) => prev.map((q) => (q.id === questId ? updated : q)));
    } catch {
      alert('Failed to update milestone');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => onNavigate('dashboard')} className="text-indigo-600 font-bold mb-1 hover:underline">
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-gray-900">🎯 Active Diagnostic Quests</h1>
          <p className="text-sm text-gray-600">
            Personalized learning paths generated from your AI mock interview weak areas. Complete milestones to earn XP!
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading your learning quests…</div>
      ) : quests.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl shadow text-center border border-gray-100">
          <div className="text-5xl mb-3">✨</div>
          <h3 className="font-black text-lg text-gray-900 mb-1">No Active Quests Yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Take an HR, Technical, or Coding mock interview round. The diagnosis engine will automatically create custom quests based on your performance.
          </p>
          <button
            onClick={() => onNavigate('ai-interview')}
            className="px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition"
          >
            🤖 Take an AI Interview Round
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {quests.map((q) => {
            const milestones = q.milestones || [];
            const completedCount = milestones.filter((m) => m.completed).length;
            const pct = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;
            const isFinished = q.status === 'COMPLETED';

            return (
              <div
                key={q.id}
                className={`bg-white rounded-2xl p-6 shadow-md border transition ${
                  isFinished ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {q.category} Quest
                      </span>
                      {isFinished && (
                        <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          ✓ Completed (+{q.xpReward} XP)
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-black text-gray-900">{q.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{q.description}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600">{pct}%</span>
                    <span className="text-xs text-gray-400 block font-semibold">Progress</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
                  <div
                    className={`h-2 rounded-full transition-all ${isFinished ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Milestones list */}
                <div className="space-y-2 mb-4">
                  {milestones.map((m) => (
                    <button
                      key={m.step}
                      onClick={() => toggleMilestone(q.id, m.step)}
                      className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between transition ${
                        m.completed
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                          : 'bg-slate-50 border-gray-200 text-gray-700 hover:bg-indigo-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            m.completed ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-gray-400'
                          }`}
                        >
                          {m.completed ? '✓' : m.step}
                        </span>
                        <span>{m.text}</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">
                        {m.completed ? 'Done' : 'Click to complete'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
