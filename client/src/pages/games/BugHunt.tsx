import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../services/api';

// Bug Hunt — click the buggy line(s) in an LLM-generated code snippet.
// Puzzle payload comes from server-cached GameContent (see codingGamesService.ts).

interface Payload {
  id: string;
  payload: {
    problemTitle: string;
    language: string;
    statement: string;
    buggyCode: string;
    bugLines: number[];         // 1-indexed
    bugDescriptions: string[];
    hint: string;
  };
}

export const BugHuntGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [round, setRound] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  useEffect(() => {
    setData(null); setPicked(new Set()); setChecked(false); setHintShown(false); setError(null);
    apiClient
      .get<Payload>('/games-content/bug-hunt/random')
      .then(setData)
      .catch((e) => setError(e?.message || 'Could not load a puzzle. Try running the batch generator (scripts/generate-game-content.ts).'));
  }, [round]);

  const lines = useMemo(() => {
    if (!data) return [];
    return data.payload.buggyCode.replace(/\r\n/g, '\n').split('\n');
  }, [data]);

  const bugSet = useMemo(() => new Set(data?.payload.bugLines || []), [data]);
  const requiredCount = bugSet.size;

  if (error) return (
    <div className="max-w-lg mx-auto py-10 text-center">
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm">{error}</div>
      <button onClick={onBack} className="text-sm font-bold text-indigo-600">← Back</button>
    </div>
  );
  if (!data) return <div className="max-w-lg mx-auto py-16 text-center text-gray-400 animate-pulse">Loading a Bug Hunt puzzle…</div>;

  const p = data.payload;
  const togglePick = (lineNum: number) => {
    if (checked) return;
    const next = new Set(picked);
    next.has(lineNum) ? next.delete(lineNum) : next.add(lineNum);
    setPicked(next);
  };

  const check = () => {
    setChecked(true);
  };

  const correctPicks = [...picked].filter((n) => bugSet.has(n)).length;
  const wrongPicks = picked.size - correctPicks;
  const missed = requiredCount - correctPicks;
  const perfect = correctPicks === requiredCount && wrongPicks === 0;
  const score = requiredCount > 0
    ? Math.max(0, Math.round(((correctPicks - wrongPicks) / requiredCount) * 100))
    : 0;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>

      <div className="bg-white p-5 rounded-2xl shadow mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
          🐛 Bug Hunt · {p.language}
        </div>
        <h1 className="text-xl font-black text-gray-900">{p.problemTitle}</h1>
        <p className="text-xs text-gray-500 mt-1 mb-3">{p.statement}</p>

        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2.5 mb-3">
          Click the line(s) you believe contain bugs. There {requiredCount === 1 ? 'is 1 bug' : `are ${requiredCount} bugs`}.
        </div>

        <div className="bg-slate-950 rounded-xl overflow-hidden font-mono text-sm">
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const isPicked = picked.has(lineNum);
            const isBug = bugSet.has(lineNum);
            let bg = 'hover:bg-slate-800';
            if (checked) {
              if (isBug && isPicked) bg = 'bg-emerald-900/40';
              else if (isBug && !isPicked) bg = 'bg-red-900/40';
              else if (!isBug && isPicked) bg = 'bg-amber-900/40';
            } else if (isPicked) {
              bg = 'bg-indigo-900/60';
            }
            return (
              <div
                key={i}
                onClick={() => togglePick(lineNum)}
                className={`flex items-start px-3 py-0.5 cursor-pointer ${bg}`}
              >
                <span className="w-8 shrink-0 text-slate-500 select-none">{lineNum}</span>
                <span className="text-slate-100 whitespace-pre">{line || ' '}</span>
              </div>
            );
          })}
        </div>

        {!checked && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setHintShown(true)}
              disabled={hintShown}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
            >
              💡 Hint
            </button>
            <button
              onClick={check}
              disabled={picked.size === 0}
              className="flex-1 py-2.5 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
            >
              Check ({picked.size} picked)
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
            <div className={`mt-4 p-4 rounded-xl text-center ${perfect ? 'bg-emerald-100' : 'bg-amber-50'}`}>
              <div className="text-3xl font-black text-gray-900">{score}%</div>
              <div className="text-sm font-bold text-gray-600 mt-1">
                {perfect ? '🎉 Perfect — all bugs found, no false alarms!'
                  : `Found ${correctPicks} of ${requiredCount} bug(s)${wrongPicks > 0 ? `, ${wrongPicks} false alarm(s)` : ''}${missed > 0 ? `, missed ${missed}` : ''}.`}
              </div>
            </div>

            {p.bugDescriptions.length > 0 && (
              <div className="mt-4 space-y-2 text-xs">
                <div className="font-black uppercase tracking-widest text-gray-500">Bug explanations</div>
                {p.bugLines.map((ln, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <span className="font-mono font-black text-indigo-600">Line {ln}:</span>{' '}
                    <span className="text-gray-700">{p.bugDescriptions[i] || '(no description)'}</span>
                  </div>
                ))}
              </div>
            )}

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
