import React, { useEffect, useMemo, useState } from 'react';
import { DIAGRAM_PUZZLES, DiagramPuzzle, DiagramSlot } from './diagramLabelerData';

// Diagram Labeler — tap a chip in the label pool to select it, then tap
// the slot to place it. Tap a filled slot to send its label back to the
// pool. Check button reveals which slots were correct.

function shuffle<T>(a: T[]): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

const SLOT_DEFAULT_W = 130;
const SLOT_DEFAULT_H = 30;

export const DiagramLabelerGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * DIAGRAM_PUZZLES.length));
  const puzzle: DiagramPuzzle = DIAGRAM_PUZZLES[idx];

  // Assignments: slotId → label string (empty means unassigned)
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const labelPool = useMemo(() => {
    const correct = puzzle.slots.map((s) => s.correctLabel);
    return shuffle([...correct, ...(puzzle.decoys || [])]);
  }, [puzzle]);

  useEffect(() => {
    setAssigned({});
    setSelectedLabel(null);
    setChecked(false);
  }, [idx]);

  const usedLabels = new Set(Object.values(assigned).filter(Boolean));

  const placeInSlot = (slot: DiagramSlot) => {
    if (checked) return;
    if (!selectedLabel) {
      // If slot is already filled, tapping returns its label to the pool
      if (assigned[slot.id]) {
        const next = { ...assigned };
        delete next[slot.id];
        setAssigned(next);
      }
      return;
    }
    // Placing selected label — replace whatever was there
    setAssigned({ ...assigned, [slot.id]: selectedLabel });
    setSelectedLabel(null);
  };

  const clickChip = (label: string) => {
    if (checked) return;
    if (usedLabels.has(label)) return;
    setSelectedLabel(selectedLabel === label ? null : label);
  };

  const check = () => setChecked(true);

  const correctCount = puzzle.slots.filter((s) => assigned[s.id] === s.correctLabel).length;
  const total = puzzle.slots.length;
  const pct = Math.round((correctCount / total) * 100);
  const allFilled = puzzle.slots.every((s) => !!assigned[s.id]);

  const nextPuzzle = () => {
    if (DIAGRAM_PUZZLES.length <= 1) { setIdx(idx); return; }
    let next = idx;
    while (next === idx) next = Math.floor(Math.random() * DIAGRAM_PUZZLES.length);
    setIdx(next);
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      <button onClick={onBack} className="text-sm font-bold text-indigo-600 mb-4">← Back</button>

      <div className="bg-white p-5 rounded-2xl shadow mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
          📐 Diagram Labeler · {puzzle.subject}
        </div>
        <h1 className="text-xl font-black text-gray-900">{puzzle.title}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-3">{puzzle.description}</p>

        {!selectedLabel && !checked && (
          <div className="text-xs text-slate-500 italic mb-2">
            Tap a label chip below → then tap the slot you want to place it in.
          </div>
        )}
        {selectedLabel && !checked && (
          <div className="text-xs font-bold text-indigo-700 mb-2 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 inline-block">
            Selected: “{selectedLabel}” — tap a slot to place, or tap the chip again to cancel
          </div>
        )}

        <div className="border border-slate-200 rounded-xl bg-white p-3 overflow-x-auto">
          <svg
            viewBox={puzzle.svgViewBox}
            className="w-full max-w-[560px] mx-auto block"
            style={{ minHeight: 260 }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <g dangerouslySetInnerHTML={{ __html: puzzle.bgSvg }} />
            {puzzle.slots.map((s) => {
              const w = s.w ?? SLOT_DEFAULT_W;
              const h = s.h ?? SLOT_DEFAULT_H;
              const x = s.x - w / 2;
              const y = s.y - h / 2;
              const value = assigned[s.id];
              const isCorrect = checked && value === s.correctLabel;
              const isWrong = checked && !!value && value !== s.correctLabel;
              const empty = !value;
              const fill = checked
                ? isCorrect ? '#dcfce7' : isWrong ? '#fee2e2' : '#f1f5f9'
                : empty ? '#ffffff' : '#eef2ff';
              const stroke = checked
                ? isCorrect ? '#16a34a' : isWrong ? '#dc2626' : '#94a3b8'
                : selectedLabel ? '#6366f1' : '#94a3b8';
              return (
                <g
                  key={s.id}
                  onClick={() => placeInSlot(s)}
                  style={{ cursor: checked ? 'default' : 'pointer' }}
                >
                  <rect x={x} y={y} width={w} height={h} rx={6}
                    fill={fill} stroke={stroke} strokeWidth={selectedLabel && !checked ? 2 : 1.5}
                    strokeDasharray={empty && !checked ? '4 3' : undefined}
                  />
                  <text x={s.x} y={s.y + 4} fontSize="13" fontWeight="700" textAnchor="middle"
                    fill={empty ? '#94a3b8' : '#1e293b'}
                  >
                    {value || 'tap to place'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Labels</div>
          <div className="flex flex-wrap gap-2">
            {labelPool.map((l, i) => {
              const used = usedLabels.has(l);
              const isSel = selectedLabel === l;
              return (
                <button
                  key={l + i}
                  onClick={() => clickChip(l)}
                  disabled={used || checked}
                  className={`px-3 py-2 rounded-full text-xs font-black border-2 transition ${
                    used ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                    : isSel ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-800 border-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {!checked ? (
            <button
              onClick={check}
              disabled={!allFilled}
              className="flex-1 py-2.5 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
            >
              {allFilled ? 'Check answers' : `Fill all ${total} slots first`}
            </button>
          ) : (
            <button
              onClick={nextPuzzle}
              className="flex-1 py-2.5 rounded-lg font-black text-white bg-indigo-600 hover:bg-indigo-700"
            >
              🔄 Next diagram
            </button>
          )}
        </div>

        {checked && (
          <div className={`mt-4 p-4 rounded-xl text-center ${pct === 100 ? 'bg-emerald-100' : 'bg-amber-50'}`}>
            <div className="text-3xl font-black text-gray-900">{correctCount} / {total}</div>
            <div className="text-sm font-bold text-gray-600 mt-1">
              {pct === 100 ? '🎉 Perfect labelling!' : `${pct}% correct — see the highlighted slots above.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
