import React from 'react';
import { StatsSidebar } from '../components/StatsSidebar';

interface SectionCard {
  icon: string;
  title: string;
  desc: string;
  page: string;
}

const PREP_CARDS: SectionCard[] = [
  { icon: '🧮', title: 'Aptitude', desc: 'Quant, logical reasoning & verbal question banks with theory notes.', page: 'interview-hub' },
  { icon: '💻', title: 'Coding', desc: 'Topic-wise DSA tracks — arrays to dynamic programming.', page: 'coding-tracks' },
  { icon: '🏢', title: 'Companies & Mocks', desc: 'Company-specific patterns and full-length mock tests.', page: 'assessments' },
  { icon: '🗣️', title: 'HR & Behavioral', desc: 'STAR-method guidance for the classic HR round questions.', page: 'hr-prep' },
  { icon: '🤖', title: 'AI Interview', desc: 'Practice live with an adaptive AI interviewer.', page: 'ai-interview' },
];

const COMPETE_CARDS: SectionCard[] = [
  { icon: '🏁', title: 'Contests', desc: 'Timed competitions against your cohort and friends.', page: 'contests' },
  { icon: '📊', title: 'Leaderboard', desc: 'See where you stand — by XP, coding and aptitude.', page: 'leaderboard' },
  { icon: '🏆', title: 'Achievements', desc: 'Badges and milestones you have unlocked so far.', page: 'achievements' },
];

const CardGrid: React.FC<{ title: string; cards: SectionCard[]; onNavigate: (page: string) => void }> = ({
  title,
  cards,
  onNavigate,
}) => (
  <div className="mb-8">
    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">{title}</p>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((card) => (
        <button
          key={card.page}
          onClick={() => onNavigate(card.page)}
          className="bg-white rounded-xl shadow p-5 text-left hover:shadow-lg hover:-translate-y-0.5 transition group"
        >
          <div className="text-3xl mb-3">{card.icon}</div>
          <h3 className="font-black text-gray-900 group-hover:text-indigo-700 transition">{card.title}</h3>
          <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
        </button>
      ))}
    </div>
  </div>
);

export const InterviewHome: React.FC<{
  userName: string;
  onNavigate: (page: string) => void;
}> = ({ userName, onNavigate }) => {
  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        {/* hero */}
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 rounded-2xl shadow-lg p-8 text-white mb-8">
          <h1 className="text-3xl md:text-4xl font-black mb-2">
            Crack your placement, {userName} 🚀
          </h1>
          <p className="text-indigo-100 font-semibold max-w-2xl">
            Aptitude drills, coding tracks, company mocks and AI-powered interviews — everything you
            need for placement season, in one place.
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={() => onNavigate('interview-hub')}
              className="px-5 py-2.5 rounded-full font-black text-sm bg-white text-indigo-700 hover:bg-indigo-50 transition"
            >
              🧮 Start Practicing
            </button>
            <button
              onClick={() => onNavigate('ai-interview')}
              className="px-5 py-2.5 rounded-full font-black text-sm bg-white/15 text-white border border-white/40 hover:bg-white/25 transition"
            >
              🤖 Try an AI Interview
            </button>
          </div>
        </div>

        <CardGrid title="Prepare" cards={PREP_CARDS} onNavigate={onNavigate} />
        <CardGrid title="Compete" cards={COMPETE_CARDS} onNavigate={onNavigate} />
      </div>

      {/* stats sidebar — hidden on small screens */}
      <div className="hidden lg:block">
        <StatsSidebar />
      </div>
    </div>
  );
};
