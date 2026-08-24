import React from 'react';

// Tiny picker for the new prep-focused games (Sprint 2 of
// plan-comprehensive-reports.md). The existing 7-game arcade lives at
// /dashboard → Game Arcade; this page groups the interview-shaped games.

const GAMES = [
  {
    key: 'complexity-sort',
    icon: '📊',
    title: 'Complexity Sort',
    desc: 'Arrange algorithms by Big-O growth rate. Trains DSA intuition.',
    subject: 'DSA',
    color: 'from-indigo-500 to-violet-600',
  },
  {
    key: 'time-rush',
    icon: '⏱',
    title: 'Time Rush',
    desc: 'Flip flashcards on a random topic — 60-second sprint. Trains recall speed.',
    subject: 'Any',
    color: 'from-amber-500 to-orange-600',
  },
  {
    key: 'star-roleplay',
    icon: '🗣',
    title: 'STAR Roleplay',
    desc: 'Pick the strongest STAR-structured answer to an HR question. Trains behavioral instincts.',
    subject: 'HR',
    color: 'from-fuchsia-500 to-pink-600',
  },
  {
    key: 'bug-hunt',
    icon: '🐛',
    title: 'Bug Hunt',
    desc: 'Click the buggy line(s) in a real code snippet. Trains careful code review.',
    subject: 'DSA',
    color: 'from-red-500 to-rose-600',
  },
  {
    key: 'dry-run',
    icon: '🔍',
    title: 'Dry-Run',
    desc: "Predict the exact stdout of a snippet by hand. Trains mental execution.",
    subject: 'DSA',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'sql-puzzle',
    icon: '🗄',
    title: 'SQL Puzzle',
    desc: 'Write real SQL against a tiny in-browser database. Trains query fluency.',
    subject: 'SQL',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    key: 'diagram-labeler',
    icon: '📐',
    title: 'Diagram Labeler',
    desc: 'Label OSI layers, TCP handshake, ER diagrams. Trains visual intuition.',
    subject: 'CN/DBMS',
    color: 'from-purple-500 to-indigo-600',
  },
];

export const PrepGamesHub: React.FC<{
  onOpen: (key: 'complexity-sort' | 'time-rush' | 'star-roleplay' | 'bug-hunt' | 'dry-run' | 'sql-puzzle' | 'diagram-labeler') => void;
}> = ({ onOpen }) => {
  return (
    <div className="max-w-3xl mx-auto py-6">
      <h1 className="text-2xl font-black text-gray-900 mb-1">🎮 Prep Games</h1>
      <p className="text-sm text-gray-500 mb-6">
        Short, interview-shaped mini-games. Play a few between drills to reinforce concepts.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((g) => (
          <button
            key={g.key}
            onClick={() => onOpen(g.key as any)}
            className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition p-5"
          >
            <div className={`inline-block px-2 py-0.5 rounded-full bg-gradient-to-r ${g.color} text-white text-[9px] font-black uppercase tracking-widest mb-3`}>
              {g.subject}
            </div>
            <div className="text-3xl mb-1">{g.icon}</div>
            <div className="font-black text-gray-900 text-lg">{g.title}</div>
            <div className="text-xs text-gray-500 mt-1">{g.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
