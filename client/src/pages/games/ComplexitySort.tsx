import React, { useMemo, useState } from 'react';

// Complexity Sort — drag/click to arrange algorithm names in Big-O order.
// Static data, no server call. Presents 5 shuffled algorithms per round.

interface Algo {
  name: string;
  complexity: string;
  rank: number;   // canonical order (lower = faster growth = "smaller")
}

// Sorted by growth rate. Rank ties are broken alphabetically for stability.
const BANK: Algo[] = [
  { name: 'Binary Search', complexity: 'O(log n)', rank: 2 },
  { name: 'Access array by index', complexity: 'O(1)', rank: 1 },
  { name: 'Linear Search', complexity: 'O(n)', rank: 3 },
  { name: 'Merge Sort', complexity: 'O(n log n)', rank: 4 },
  { name: 'Quick Sort (avg)', complexity: 'O(n log n)', rank: 4 },
  { name: 'Heap Sort', complexity: 'O(n log n)', rank: 4 },
  { name: 'Bubble Sort', complexity: 'O(n²)', rank: 5 },
  { name: 'Insertion Sort (worst)', complexity: 'O(n²)', rank: 5 },
  { name: 'Selection Sort', complexity: 'O(n²)', rank: 5 },
  { name: 'Naive DFS on adjacency matrix', complexity: 'O(V²)', rank: 5 },
  { name: 'BFS on adjacency list', complexity: 'O(V + E)', rank: 3 },
  { name: "Dijkstra (min-heap)", complexity: 'O((V+E) log V)', rank: 4 },
  { name: 'Floyd-Warshall (all pairs)', complexity: 'O(V³)', rank: 6 },
  { name: 'Bellman-Ford', complexity: 'O(V·E)', rank: 5 },
  { name: 'Naive Fibonacci (recursive)', complexity: 'O(2ⁿ)', rank: 7 },
  { name: 'DP Fibonacci', complexity: 'O(n)', rank: 3 },
  { name: 'Traveling Salesman (brute)', complexity: 'O(n!)', rank: 8 },
  { name: 'HashMap lookup (avg)', complexity: 'O(1)', rank: 1 },
  { name: 'BST search (balanced)', complexity: 'O(log n)', rank: 2 },
  { name: 'Coin change DP', complexity: 'O(n·amount)', rank: 4 },
];

function sampleFive(): Algo[] {
  const copy = [...BANK];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 5);
}

function isSortedAscending(list: Algo[]): boolean {
  for (let i = 1; i < list.length; i++) if (list[i - 1].rank > list[i].rank) return false;
  return true;
}

export const ComplexitySortGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [round, setRound] = useState(0);
  const initial = useMemo(() => sampleFive(), [round]);
  const [order, setOrder] = useState<Algo[]>(initial);
  const [result, setResult] = useState<null | { correct: boolean; score: number }>(null);

  React.useEffect(() => { setOrder(initial); setResult(null); }, [initial]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
  };

  const check = () => {
    const correct = isSortedAscending(order);
    // Score = number of adjacent pairs in correct order — partial credit
    let goodPairs = 0;
    for (let i = 1; i < order.length; i++) if (order[i - 1].rank <= order[i].rank) goodPairs++;
    const score = Math.round((goodPairs / (order.length - 1)) * 100);
    setResult({ correct, score });
  };

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="flex justify-between mb-4">
        <button onClick={onBack} className="text-sm font-bold text-indigo-600">← Back</button>
        <div className="text-xs font-black uppercase tracking-widest text-gray-400">Round {round + 1}</div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow mb-4">
        <h1 className="text-2xl font-black text-gray-900 mb-1">📊 Complexity Sort</h1>
        <p className="text-sm text-gray-600 mb-5">
          Arrange these algorithms from <b>fastest growth</b> (O(1) at top) to <b>slowest</b> (O(n!) at bottom).
        </p>

        <div className="space-y-2">
          {order.map((a, idx) => (
            <div
              key={a.name + idx}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                result
                  ? isSortedAscending(order.slice(0, idx + 1)) && (idx === 0 || order[idx - 1].rank <= a.rank)
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="text-xs font-black text-gray-400 w-6">{idx + 1}</div>
              <div className="flex-1 font-bold text-gray-900">{a.name}</div>
              {result && (
                <span className="text-xs font-black text-indigo-600 font-mono">{a.complexity}</span>
              )}
              {!result && (
                <div className="flex gap-1">
                  <button
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-black"
                  >↑</button>
                  <button
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === order.length - 1}
                    className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-black"
                  >↓</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {result ? (
          <div className={`mt-5 p-4 rounded-xl text-center ${result.correct ? 'bg-emerald-100' : 'bg-amber-50'}`}>
            <div className="text-3xl font-black text-gray-900">{result.score}%</div>
            <div className="text-sm font-bold text-gray-600 mt-1">
              {result.correct ? '🎉 Perfect order!' : 'Nice try — check the complexities above.'}
            </div>
          </div>
        ) : (
          <button
            onClick={check}
            className="w-full mt-5 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition"
          >
            Check my order
          </button>
        )}

        {result && (
          <button
            onClick={() => setRound(round + 1)}
            className="w-full mt-3 py-2.5 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition"
          >
            🔄 Play again
          </button>
        )}
      </div>
    </div>
  );
};
