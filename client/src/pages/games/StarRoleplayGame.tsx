import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';

// STAR Roleplay — pick the strongest STAR-structured answer for an HR
// question. 4 candidate answers with quality labels + rationales; the "why"
// only appears after the pick so it becomes a mini-lesson.

interface Answer {
  text: string;
  quality: 'strong' | 'weak-vague' | 'weak-blame' | 'weak-generic';
  why: string;
}
interface Payload {
  id: string;
  payload: {
    question: string;
    category: string;
    answers: Answer[];
    correctIndex: number;
  };
}

const QUALITY_LABEL: Record<string, { label: string; color: string }> = {
  strong:         { label: '✓ Strong STAR answer', color: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
  'weak-vague':   { label: 'Vague — no specifics',  color: 'bg-amber-50 border-amber-300 text-amber-800' },
  'weak-blame':   { label: 'Blame / red flag',       color: 'bg-red-50 border-red-300 text-red-800' },
  'weak-generic': { label: 'Generic / textbook',     color: 'bg-slate-50 border-slate-300 text-slate-700' },
};

export const StarRoleplayGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [round, setRound] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setData(null);
    setPicked(null);
    setError(null);
    apiClient
      .get<Payload>('/games-content/star-roleplay/random')
      .then(setData)
      .catch(() => setError('Could not load a scenario — try again.'));
  }, [round]);

  if (error) return <div className="max-w-lg mx-auto py-10 text-center text-red-700">{error}</div>;
  if (!data) return <div className="max-w-lg mx-auto py-16 text-center text-gray-400 animate-pulse">Loading a scenario…</div>;

  const p = data.payload;
  const correctIndex = p.correctIndex;
  const isCorrect = picked === correctIndex;

  return (
    <div className="max-w-2xl mx-auto py-6">
      <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>

      <div className="bg-white p-6 rounded-2xl shadow mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
          🗣 HR Roleplay · {p.category}
        </div>
        <h1 className="text-xl font-black text-gray-900 mb-4">{p.question}</h1>
        <p className="text-xs text-gray-500 mb-5">Pick the answer that best follows the STAR method (Situation → Task → Action → Result).</p>

        <div className="space-y-3">
          {p.answers.map((a, i) => {
            const isPicked = picked === i;
            const meta = QUALITY_LABEL[a.quality] || QUALITY_LABEL['weak-generic'];
            const showReveal = picked !== null;
            return (
              <button
                key={i}
                onClick={() => picked === null && setPicked(i)}
                disabled={picked !== null}
                className={`w-full text-left p-4 rounded-xl border-2 transition ${
                  showReveal
                    ? meta.color
                    : isPicked
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-xs font-black text-gray-400 mt-0.5">{String.fromCharCode(65 + i)}.</div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{a.text}</div>
                    {showReveal && (
                      <div className="mt-3 text-[10px] font-black uppercase tracking-widest">
                        {meta.label}
                      </div>
                    )}
                    {showReveal && a.why && (
                      <div className="mt-1 text-xs italic opacity-80">Why: {a.why}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div className={`mt-5 p-4 rounded-xl text-center ${isCorrect ? 'bg-emerald-100' : 'bg-amber-50'}`}>
            <div className="text-3xl">{isCorrect ? '🎉' : '💡'}</div>
            <div className="font-black text-gray-900 mt-1">
              {isCorrect ? 'Nailed it!' : `The strong answer was option ${String.fromCharCode(65 + correctIndex)}.`}
            </div>
          </div>
        )}

        {picked !== null && (
          <button
            onClick={() => setRound(round + 1)}
            className="w-full mt-4 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition"
          >
            Next scenario →
          </button>
        )}
      </div>
    </div>
  );
};
