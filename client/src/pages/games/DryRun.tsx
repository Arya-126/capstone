import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';

// Dry-Run — predict the output of a small snippet.
// Puzzle payload comes from server-cached GameContent (codingGamesService.ts).
// Answer compared with normalized whitespace/case-insensitive fallback.

interface Payload {
  id: string;
  payload: {
    problemTitle: string;
    language: string;
    snippet: string;
    input: string;
    expectedOutput: string;
    hint: string;
  };
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .toLowerCase();
}

export const DryRunGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [round, setRound] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guess, setGuess] = useState('');
  const [checked, setChecked] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  useEffect(() => {
    setData(null); setGuess(''); setChecked(false); setHintShown(false); setError(null);
    apiClient
      .get<Payload>('/games-content/dry-run/random')
      .then(setData)
      .catch((e) => setError(e?.message || 'Could not load a puzzle. Try running the batch generator.'));
  }, [round]);

  if (error) return (
    <div className="max-w-lg mx-auto py-10 text-center">
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm">{error}</div>
      <button onClick={onBack} className="text-sm font-bold text-indigo-600">← Back</button>
    </div>
  );
  if (!data) return <div className="max-w-lg mx-auto py-16 text-center text-gray-400 animate-pulse">Loading a Dry-Run puzzle…</div>;

  const p = data.payload;
  const isCorrect = checked && normalize(guess) === normalize(p.expectedOutput);

  return (
    <div className="max-w-3xl mx-auto py-6">
      <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>

      <div className="bg-white p-5 rounded-2xl shadow mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
          🔍 Dry-Run · {p.language}
        </div>
        <h1 className="text-xl font-black text-gray-900">{p.problemTitle}</h1>
        <p className="text-xs text-gray-500 mt-1 mb-3">Trace the code by hand and predict its output.</p>

        <div className="bg-slate-950 text-slate-100 rounded-xl overflow-hidden font-mono text-sm p-3 mb-3 overflow-x-auto">
          <pre className="whitespace-pre">{p.snippet}</pre>
        </div>

        {p.input && (
          <div className="mb-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Input (stdin)</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono whitespace-pre">{p.input}</pre>
          </div>
        )}

        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1 block">
          Your predicted output
        </label>
        <textarea
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          disabled={checked}
          placeholder="Type the exact stdout you think this snippet will print…"
          rows={3}
          className="w-full border rounded-xl px-3 py-2 text-sm font-mono resize-none disabled:bg-slate-50"
        />

        {!checked && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setHintShown(true)}
              disabled={hintShown}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
            >
              💡 Hint
            </button>
            <button
              onClick={() => setChecked(true)}
              disabled={!guess.trim()}
              className="flex-1 py-2.5 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
            >
              Check
            </button>
          </div>
        )}

        {hintShown && !checked && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900">
            💡 {p.hint}
          </div>
        )}

        {checked && (
          <>
            <div className={`mt-4 p-4 rounded-xl ${isCorrect ? 'bg-emerald-100' : 'bg-amber-50'}`}>
              <div className="text-3xl text-center">{isCorrect ? '🎉' : '💡'}</div>
              <div className="font-black text-center text-gray-900 mt-1">
                {isCorrect ? 'Nailed it!' : 'Not quite — see the expected output below.'}
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div>
                  <div className="font-black uppercase text-gray-500">Your answer</div>
                  <pre className={`p-2 rounded font-mono whitespace-pre border ${isCorrect ? 'bg-white border-emerald-200' : 'bg-white border-red-200'}`}>{guess}</pre>
                </div>
                {!isCorrect && (
                  <div>
                    <div className="font-black uppercase text-gray-500">Expected</div>
                    <pre className="p-2 rounded font-mono whitespace-pre bg-white border border-emerald-200 text-emerald-700">{p.expectedOutput}</pre>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setRound(round + 1)}
              className="w-full mt-4 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700"
            >
              🔄 Next puzzle
            </button>
          </>
        )}
      </div>
    </div>
  );
};
