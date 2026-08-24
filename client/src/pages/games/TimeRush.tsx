import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/api';

// Time Rush — 60-second flashcard sprint on a random topic.
// Cards are derived server-side from InterviewTheory.keyPoints.
// User self-reports "got it" / "next" — count of self-reported-correct in 60s.

interface Card {
  id: string;
  kind: 'term-def' | 'fact';
  prompt: string;
  answer: string | null;
}
interface Payload {
  topicId: string;
  topicName: string;
  categoryName: string;
  durationSec: number;
  cards: Card[];
}

export const TimeRushGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [got, setGot] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(60000);
  const startTs = useRef<number>(0);

  useEffect(() => {
    apiClient
      .get<Payload>('/games-content/time-rush/random')
      .then(setData)
      .catch(() => setError('Could not load a topic — try again.'));
  }, []);

  // 60-second timer
  useEffect(() => {
    if (phase !== 'play' || !data) return;
    startTs.current = Date.now();
    setTimeLeftMs(data.durationSec * 1000);
    const t = setInterval(() => {
      const remaining = Math.max(0, data.durationSec * 1000 - (Date.now() - startTs.current));
      setTimeLeftMs(remaining);
      if (remaining === 0) {
        clearInterval(t);
        setPhase('done');
      }
    }, 200);
    return () => clearInterval(t);
  }, [phase, data]);

  if (error) return <div className="max-w-lg mx-auto py-10 text-center text-red-700">{error}</div>;
  if (!data) return <div className="max-w-lg mx-auto py-16 text-center text-gray-400 animate-pulse">Loading…</div>;

  if (phase === 'intro') {
    return (
      <div className="max-w-xl mx-auto py-6">
        <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>
        <div className="bg-white p-6 rounded-2xl shadow">
          <div className="text-4xl mb-2">⏱</div>
          <h1 className="text-2xl font-black text-gray-900">Time Rush</h1>
          <p className="text-sm text-gray-500 mt-1">
            Topic: <b>{data.topicName}</b> ({data.categoryName})
          </p>
          <ul className="text-sm text-gray-700 space-y-2 my-5">
            <li>• {data.durationSec} seconds, {data.cards.length} flashcards</li>
            <li>• Tap to reveal the answer, then rate yourself <b>Got it</b> or <b>Next</b></li>
            <li>• Count of "Got it" is your score</li>
          </ul>
          <button
            onClick={() => setPhase('play')}
            className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition"
          >
            🚀 Start
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const total = got + skipped;
    const pct = total > 0 ? Math.round((got / total) * 100) : 0;
    return (
      <div className="max-w-xl mx-auto py-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow">
          <div className="text-5xl font-black text-indigo-600">{got}</div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Got it in 60 seconds</div>
          <div className="text-sm text-gray-600 mt-4">
            Attempted {total} cards · {pct}% confidence
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onBack} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-slate-100">
              Back
            </button>
            <button
              onClick={() => {
                setPhase('intro'); setIdx(0); setGot(0); setSkipped(0); setRevealed(false);
              }}
              className="flex-1 py-3 rounded-xl font-black text-white bg-indigo-600"
            >
              🔄 Play again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // playing
  const card = data.cards[idx % data.cards.length];
  const secLeft = Math.ceil(timeLeftMs / 1000);
  const barPct = (timeLeftMs / (data.durationSec * 1000)) * 100;
  const barColor = barPct < 20 ? 'bg-red-500' : 'bg-indigo-500';

  const advance = (gotIt: boolean) => {
    if (gotIt) setGot(got + 1);
    else setSkipped(skipped + 1);
    setRevealed(false);
    setIdx(idx + 1);
  };

  return (
    <div className="max-w-xl mx-auto py-6">
      <div className="flex justify-between items-center mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">
        <span>Card {idx + 1}</span>
        <span className={secLeft < 12 ? 'text-red-600' : 'text-gray-700'}>{secLeft}s</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1 mb-4">
        <div className={`h-1 rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
      </div>

      <div className="bg-white p-8 rounded-2xl shadow min-h-[280px] flex flex-col justify-center text-center">
        <div className="text-[10px] font-black uppercase text-indigo-500 mb-2">
          {card.kind === 'term-def' ? 'Define this' : 'Recall'}
        </div>
        <div className="text-xl font-black text-gray-900 mb-4 whitespace-pre-wrap">{card.prompt}</div>
        {revealed && card.answer && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 whitespace-pre-wrap">
            {card.answer}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        {card.answer && !revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="flex-1 py-3 rounded-xl font-black text-white bg-slate-800 hover:bg-slate-900 transition"
          >
            👁 Reveal
          </button>
        )}
        <button
          onClick={() => advance(false)}
          className="flex-1 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
        >
          Next
        </button>
        <button
          onClick={() => advance(true)}
          className="flex-1 py-3 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700 transition"
        >
          ✓ Got it
        </button>
      </div>

      <div className="text-center text-xs text-gray-400 mt-3">
        Score so far: <b className="text-emerald-700">{got}</b> · Skipped: {skipped}
      </div>
    </div>
  );
};
