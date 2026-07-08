import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface Props {
  topicId: string;
  topicName: string;
  onSelectGame: (gameId: 'flashcards' | 'match' | 'sprint') => void;
  onSelectClassicGame: (gameType: string) => void;
  onBack: () => void;
}

export const InterviewGameSelect: React.FC<Props> = ({ topicId, topicName, onSelectGame, onSelectClassicGame, onBack }) => {
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAvailability = async () => {
      try {
        const data = await apiClient.get<Record<string, boolean>>(`/games/interview-availability/${topicId}`);
        if (!cancelled) setAvailability(data);
      } catch {
        // Endpoint may not exist yet — default everything to available, never block the UI
        if (!cancelled) setAvailability(null);
      }
    };
    fetchAvailability();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const isAvailable = (gameType: string): boolean => {
    if (!availability) return true;
    return availability[gameType] !== false;
  };

  const formulaGames = [
    {
      id: 'flashcards' as const,
      name: 'Formula Flash Cards',
      emoji: '🃏',
      desc: 'Spaced repetition flash cards to quickly memorize key formulas.',
      color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-500',
      text: 'text-indigo-900',
    },
    {
      id: 'match' as const,
      name: 'Formula Match',
      emoji: '🔗',
      desc: 'Connect formula names with their mathematical expressions.',
      color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-500',
      text: 'text-emerald-900',
    },
    {
      id: 'sprint' as const,
      name: 'Concept Sprint',
      emoji: '⚡',
      desc: 'Rapid-fire True/False game based on the study notes.',
      color: 'bg-amber-50 border-amber-200 hover:border-amber-500',
      text: 'text-amber-900',
    }
  ];

  const classicGames = [
    {
      type: 'MEMORY_MATCH',
      name: 'Memory Match',
      emoji: '🧠',
      desc: 'Match terms & formulas to meanings',
      color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-500',
      text: 'text-indigo-900',
    },
    {
      type: 'WORD_SCRAMBLE',
      name: 'Word Scramble',
      emoji: '🔤',
      desc: 'Unscramble key terms',
      color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-500',
      text: 'text-emerald-900',
    },
    {
      type: 'CROSSWORD',
      name: 'Crossword',
      emoji: '📝',
      desc: 'Terms from clues',
      color: 'bg-amber-50 border-amber-200 hover:border-amber-500',
      text: 'text-amber-900',
    },
    {
      type: 'HANGMAN',
      name: 'Hangman',
      emoji: '💀',
      desc: 'Guess the concept',
      color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-500',
      text: 'text-indigo-900',
    },
    {
      type: 'FILL_BLANK',
      name: 'Fill the Blank',
      emoji: '⚡',
      desc: 'Complete formulas & facts',
      color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-500',
      text: 'text-emerald-900',
    },
    {
      type: 'CONCEPT_CANNON',
      name: 'Concept Cannon',
      emoji: '🎯',
      desc: 'Sort TRUE vs FALSE statements',
      color: 'bg-amber-50 border-amber-200 hover:border-amber-500',
      text: 'text-amber-900',
    }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center mb-8">
        <button onClick={onBack} className="mr-4 text-gray-500 hover:text-gray-800 transition">
          <span className="text-2xl">←</span>
        </button>
        <h2 className="text-3xl font-bold text-gray-800">Study Games: {topicName}</h2>
      </div>

      <h3 className="text-xl font-black text-gray-800 mb-4">⚡ Formula games</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {formulaGames.map(game => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all transform hover:-translate-y-1 shadow-sm hover:shadow-lg ${game.color}`}
          >
            <div className="text-4xl mb-4">{game.emoji}</div>
            <h3 className={`text-xl font-bold mb-2 ${game.text}`}>{game.name}</h3>
            <p className="text-gray-600 flex-1">{game.desc}</p>
            <div className="mt-6 font-bold text-sm tracking-wider uppercase opacity-70">
              Play Game →
            </div>
          </button>
        ))}
      </div>

      <h3 className="text-xl font-black text-gray-800 mb-4">🎮 Classic study games</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {classicGames.map(game => {
          const available = isAvailable(game.type);
          return (
            <button
              key={game.type}
              onClick={() => available && onSelectClassicGame(game.type)}
              disabled={!available}
              className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all shadow-sm ${
                available
                  ? `transform hover:-translate-y-1 hover:shadow-lg ${game.color}`
                  : 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-4xl mb-4">{game.emoji}</div>
              <h3 className={`text-xl font-bold mb-2 ${available ? game.text : 'text-gray-500'}`}>{game.name}</h3>
              <p className={`flex-1 ${available ? 'text-gray-600' : 'text-gray-400'}`}>{game.desc}</p>
              <div className="mt-6 font-bold text-sm tracking-wider uppercase opacity-70">
                {available ? 'Play Game →' : 'Not available yet'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
