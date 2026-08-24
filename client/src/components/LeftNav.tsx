import React from 'react';

interface NavItem {
  icon: string;
  label: string;
  page: string;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'Prep',
    items: [
      { icon: '🎯', label: 'My Pipeline', page: 'pipeline' },
      { icon: '🏠', label: 'Home', page: 'interview-home' },
      { icon: '🚀', label: 'Placement Drive', page: 'placement-drive' },
      { icon: '📊', label: 'Prep Analytics', page: 'prep-tracker' },
      { icon: '📝', label: 'Reports', page: 'reports' },
      { icon: '🎮', label: 'Prep Games', page: 'prep-games' },
      { icon: '🎯', label: 'Active Quests', page: 'quests-hub' },
      { icon: '🧮', label: 'Aptitude', page: 'interview-hub' },
      { icon: '💻', label: 'Coding Tracks', page: 'coding-tracks' },
      { icon: '📚', label: 'Core CS Drills', page: 'core-cs-hub' },
      { icon: '🏢', label: 'Companies & Mocks', page: 'assessments' },
      { icon: '🗣️', label: 'HR & Behavioral', page: 'hr-prep' },
      { icon: '🤖', label: 'AI Interview', page: 'ai-interview' },
    ],
  },
  {
    title: 'Compete',
    items: [
      { icon: '🏁', label: 'Contests', page: 'contests' },
      { icon: '📊', label: 'Leaderboard', page: 'leaderboard' },
      { icon: '🏆', label: 'Achievements', page: 'achievements' },
    ],
  },
  {
    title: 'More',
    items: [{ icon: '🎮', label: 'Learning Games', page: 'dashboard' }],
  },
];

const ADMIN_SECTION: NavSection = {
  title: 'Admin',
  items: [
    { icon: '🔍', label: 'Review Queue', page: 'review-queue' },
    { icon: '🛠️', label: 'Test Builder', page: 'test-builder' },
    { icon: '📈', label: 'Reports', page: 'admin-reports' },
  ],
};

export const LeftNav: React.FC<{
  currentPage: string;
  role?: string;
  onNavigate: (page: string) => void;
}> = ({ currentPage, role, onNavigate }) => {
  const sections =
    role === 'ADMIN' || role === 'EDUCATOR' ? [...SECTIONS, ADMIN_SECTION] : SECTIONS;

  return (
    <nav className="w-56 shrink-0 sticky top-4 self-start bg-white rounded-xl shadow p-3">
      {sections.map((section) => (
        <div key={section.title} className="mb-3 last:mb-0">
          <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = currentPage === item.page;
              return (
                <button
                  key={item.page}
                  onClick={() => onNavigate(item.page)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-left transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
};
