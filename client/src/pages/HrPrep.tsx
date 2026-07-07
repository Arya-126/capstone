import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// HR & Behavioral prep bank. Category chips + company filter over GET /hr,
// expandable question cards showing STAR guidance + an answer skeleton
// (rendered with a tiny markdown-ish parser — bold + bullets, no deps),
// and a "Practice with AI" hook into the AI interviewer.

interface HrQuestion {
  id: string;
  question: string;
  category: string;
  starGuidance: string;
  sampleOutline: string | null;
  companyTags: string[];
  sortOrder: number;
}

interface HrCategory {
  category: string;
  count: number;
}

const COMPANIES: { slug: string; name: string }[] = [
  { slug: 'tcs', name: 'TCS' },
  { slug: 'infosys', name: 'Infosys' },
  { slug: 'wipro', name: 'Wipro' },
  { slug: 'accenture', name: 'Accenture' },
  { slug: 'cognizant', name: 'Cognizant' },
  { slug: 'capgemini', name: 'Capgemini' },
  { slug: 'amazon', name: 'Amazon' },
  { slug: 'microsoft', name: 'Microsoft' },
  { slug: 'deloitte', name: 'Deloitte' },
  { slug: 'zs-associates', name: 'ZS Associates' },
  { slug: 'goldman-sachs', name: 'Goldman Sachs' },
  { slug: 'jp-morgan', name: 'JP Morgan' },
  { slug: 'standard-chartered', name: 'Standard Chartered' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  intro: '👋',
  strengths: '💪',
  weakness: '🌱',
  failure: '📉',
  conflict: '⚖️',
  teamwork: '🤝',
  leadership: '🧭',
  'why-us': '🏢',
  'career-goals': '🎯',
  pressure: '⏱️',
  situational: '🎭',
};

const prettify = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const companyName = (slug: string) => COMPANIES.find((c) => c.slug === slug)?.name || prettify(slug);

// ---- tiny markdown-ish renderer: **bold** + "- " bullets, pre-wrap otherwise ----

const BoldText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-gray-900">
            {p}
          </strong>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
};

const Markdownish: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5">
    {text.split('\n').map((line, i) => {
      const t = line.trim();
      if (!t) return null;
      if (t.startsWith('- ')) {
        return (
          <div key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="text-indigo-500 shrink-0 font-bold">•</span>
            <span>
              <BoldText text={t.slice(2)} />
            </span>
          </div>
        );
      }
      return (
        <p key={i} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          <BoldText text={t} />
        </p>
      );
    })}
  </div>
);

// ---- main page ----

export const HrPrep: React.FC<{
  onBack: () => void;
  onPracticeWithAI: (question: string) => void;
}> = ({ onBack, onPracticeWithAI }) => {
  const [categories, setCategories] = useState<HrCategory[]>([]);
  const [questions, setQuestions] = useState<HrQuestion[]>([]);
  const [category, setCategory] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<HrCategory[]>('/hr/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (company) params.set('company', company);
    const qs = params.toString();
    apiClient
      .get<HrQuestion[]>(`/hr${qs ? `?${qs}` : ''}`)
      .then((qsList) => {
        setQuestions(qsList);
        setExpanded(null);
      })
      .catch((e) => setError(e?.message || 'Failed to load HR questions'))
      .finally(() => setLoading(false));
  }, [category, company]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="bg-white shadow rounded-lg px-3 py-2 font-bold text-sm hover:bg-gray-50"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-black text-gray-800">🗣️ HR &amp; Behavioral Prep</h1>
          <p className="text-sm text-gray-500">
            Curated questions with STAR guidance and answer skeletons — build your own stories, never memorize scripts.
          </p>
        </div>
      </div>

      {/* filters */}
      <div className="bg-white rounded-xl shadow p-5 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
              category === ''
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-indigo-50'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setCategory(c.category === category ? '' : c.category)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold transition ${
                category === c.category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-indigo-50'
              }`}
            >
              {CATEGORY_EMOJI[c.category] || '💬'} {prettify(c.category)}{' '}
              <span className={category === c.category ? 'text-indigo-200' : 'text-gray-400'}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-gray-600">🏢 Company:</label>
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">All companies</option>
            {COMPANIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          {company && (
            <span className="text-xs text-gray-400">
              showing questions {companyName(company)} famously asks
            </span>
          )}
        </div>
      </div>

      {/* list */}
      {error ? (
        <div className="bg-red-50 rounded-xl p-6 text-center text-red-700 font-bold">{error}</div>
      ) : loading ? (
        <div className="text-gray-500 italic p-12 text-center">Loading questions…</div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
          No questions match these filters. Try clearing the company filter.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => {
            const open = expanded === q.id;
            return (
              <div key={q.id} className="bg-white rounded-xl shadow overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : q.id)}
                  className="w-full text-left p-5 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-800">{q.question}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                          {CATEGORY_EMOJI[q.category] || '💬'} {prettify(q.category)}
                        </span>
                        {q.companyTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"
                          >
                            {companyName(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-gray-400 font-black shrink-0 mt-1">{open ? '▲' : '▼'}</span>
                  </div>
                </button>

                {open && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-black text-indigo-700 mb-2">📋 How to structure your answer</h3>
                      <Markdownish text={q.starGuidance} />
                    </div>
                    {q.sampleOutline && (
                      <div className="bg-emerald-50 rounded-lg p-4">
                        <h3 className="text-sm font-black text-emerald-700 mb-2">
                          🧩 Answer skeleton (fill with YOUR stories)
                        </h3>
                        <Markdownish text={q.sampleOutline} />
                      </div>
                    )}
                    <button
                      onClick={() => onPracticeWithAI(q.question)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2 px-4 rounded-lg transition"
                    >
                      🤖 Practice with AI
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
