import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { CompanyPrep } from './CompanyPrep';

// Tabbed CompanyDetail — one place for the four company-scoped things a
// student needs before an interview. The Overview tab reuses the CompanyPrep
// component (readiness + pattern-mock CTAs); Coding / Technical / HR are
// backed by /companies/:slug/detail.
//
// Data model:
//   coding    → verified CodingProblems tagged with this company slug
//   technical → CompanyQuestion rows (concept-based, non-coding), grouped by subject
//   hr        → HrQuestion rows with the company slug in companyTags

interface CodingItem {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  track: string | null;
  level: number;
  topic: { name: string; slug: string };
  solved: boolean;
  bestScore: number | null;
}

interface TechnicalQuestion {
  id: string;
  category: string;
  subject: string | null;
  question: string;
  answerHint: string | null;
  difficulty: string;
  tags: string[];
}

interface HrQuestion {
  id: string;
  question: string;
  category: string;
  starGuidance: string;
  sampleOutline: string | null;
  companyTags: string[];
}

interface Detail {
  company: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    notes: string | null;
  };
  technical: {
    total: number;
    bySubject: Record<string, TechnicalQuestion[]>;
  };
  coding: CodingItem[];
  hr: HrQuestion[];
}

type Tab = 'overview' | 'coding' | 'technical' | 'hr';

const SUBJECT_META: Record<string, { icon: string; label: string; color: string }> = {
  OOPS: { icon: '🧱', label: 'OOP', color: 'bg-indigo-100 text-indigo-800' },
  OS: { icon: '🖥️', label: 'Operating Systems', color: 'bg-emerald-100 text-emerald-800' },
  DBMS: { icon: '🗄️', label: 'DBMS & SQL', color: 'bg-amber-100 text-amber-800' },
  CN: { icon: '🌐', label: 'Computer Networks', color: 'bg-sky-100 text-sky-800' },
  DSA: { icon: '📊', label: 'Data Structures & Algorithms', color: 'bg-fuchsia-100 text-fuchsia-800' },
  SYSTEM_DESIGN: { icon: '🏗️', label: 'System Design', color: 'bg-rose-100 text-rose-800' },
};

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'text-emerald-600',
  medium: 'text-amber-600',
  hard: 'text-rose-600',
  EASY: 'text-emerald-600',
  MEDIUM: 'text-amber-600',
  HARD: 'text-rose-600',
};

// Tiny markdown-ish renderer: **bold**, `code`, newlines → <br>, and single-line
// bullets. Deliberately narrow — we control the source content.
const renderMarkdown = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // bullets
    const isBullet = /^\s*[-*]\s+/.test(line);
    const body = isBullet ? line.replace(/^\s*[-*]\s+/, '') : line;
    const parts: React.ReactNode[] = [];
    let remaining = body;
    let key = 0;
    while (remaining.length) {
      const boldM = remaining.match(/\*\*(.+?)\*\*/);
      const codeM = remaining.match(/`([^`]+)`/);
      const m = boldM && (!codeM || boldM.index! <= codeM.index!) ? boldM : codeM;
      if (!m) {
        parts.push(remaining);
        break;
      }
      if (m.index! > 0) parts.push(remaining.slice(0, m.index));
      if (m === boldM) parts.push(<strong key={key++}>{m[1]}</strong>);
      else parts.push(<code key={key++} className="bg-gray-100 rounded px-1 text-[0.85em] font-mono">{m[1]}</code>);
      remaining = remaining.slice(m.index! + m[0].length);
    }
    if (isBullet) return <li key={i} className="ml-5 list-disc">{parts}</li>;
    return (
      <React.Fragment key={i}>
        {parts}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
};

export const CompanyDetail: React.FC<{
  slug: string;
  onBack: () => void;
  onStartTest: (testId: string) => void;
  onStartInterview: (role: string, companyId: string) => void;
  onOpenProblem: (slug: string) => void;
  onPracticeHr: (question: HrQuestion, companySlug: string) => void;
}> = ({ slug, onBack, onStartTest, onStartInterview, onOpenProblem, onPracticeHr }) => {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('companyDetailTab') as Tab) || 'overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTechnical, setExpandedTechnical] = useState<Set<string>>(new Set());
  const [expandedHr, setExpandedHr] = useState<Set<string>>(new Set());
  const [techSubjectFilter, setTechSubjectFilter] = useState<string | null>(null);
  const [hrCategoryFilter, setHrCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem('companyDetailTab', tab);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<Detail>(`/companies/${slug}/detail`)
      .then((d) => setDetail(d))
      .catch(() => setError('Failed to load company detail'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="text-gray-500 italic p-8 text-center">Loading…</div>;
  if (error && !detail) return <div className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</div>;
  if (!detail) return null;

  const subjects = Object.keys(detail.technical.bySubject);
  const visibleTechnical = techSubjectFilter
    ? { [techSubjectFilter]: detail.technical.bySubject[techSubjectFilter] || [] }
    : detail.technical.bySubject;

  const hrCategories = Array.from(new Set(detail.hr.map((q) => q.category)));
  const visibleHr = hrCategoryFilter ? detail.hr.filter((q) => q.category === hrCategoryFilter) : detail.hr;

  const toggleTech = (id: string) => {
    const next = new Set(expandedTechnical);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTechnical(next);
  };
  const toggleHr = (id: string) => {
    const next = new Set(expandedHr);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedHr(next);
  };

  const tabButton = (id: Tab, label: string, badge?: number | string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
        tab === id
          ? 'text-indigo-700 border-indigo-600 bg-white'
          : 'text-gray-500 border-transparent hover:text-indigo-600'
      }`}
    >
      {label}
      {badge != null && (
        <span
          className={`ml-2 text-xs font-black px-1.5 py-0.5 rounded ${
            tab === id ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-200 text-gray-700'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div>
      {/* Sticky-style header with tabs. Overview keeps its own back button, so
          on the Overview tab we hide the outer back to avoid double-backs. */}
      {tab !== 'overview' && (
        <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-bold mb-4">
          ← Back
        </button>
      )}

      {tab !== 'overview' && (
        <div className="flex items-center gap-3 mb-4">
          {detail.company.logoUrl && (
            <img src={detail.company.logoUrl} alt="" className="w-10 h-10 rounded bg-white p-1 border" />
          )}
          <h1 className="text-2xl font-black text-gray-800">{detail.company.name}</h1>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabButton('overview', '📊 Overview')}
        {tabButton('coding', '💻 Coding', detail.coding.length)}
        {tabButton('technical', '🧠 Technical', detail.technical.total)}
        {tabButton('hr', '🤝 HR', detail.hr.length)}
      </div>

      {tab === 'overview' && (
        <CompanyPrep
          slug={slug}
          onBack={onBack}
          onStartTest={onStartTest}
          onStartInterview={onStartInterview}
        />
      )}

      {tab === 'coding' && (
        <div>
          {detail.coding.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
              No coding problems are currently tagged for {detail.company.name}. Try the general{' '}
              <span className="font-bold text-indigo-600">Coding Tracks</span> in the left nav.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {detail.coding.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProblem(p.slug)}
                  className="text-left bg-white rounded-xl shadow p-4 hover:shadow-md hover:ring-2 hover:ring-indigo-200 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-gray-800">{p.title}</span>
                    {p.solved ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        ✓ Solved{p.bestScore != null ? ` · ${Math.round(p.bestScore)}%` : ''}
                      </span>
                    ) : (
                      <span className={`text-xs font-bold ${DIFFICULTY_COLOR[p.difficulty] || 'text-gray-500'}`}>
                        {p.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.topic.name} · L{p.level}
                    {p.track && p.track !== p.topic.slug ? ` · track: ${p.track}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'technical' && (
        <div>
          {detail.technical.total === 0 ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
              No technical questions authored for {detail.company.name} yet.
            </div>
          ) : (
            <>
              {subjects.length > 1 && (
                <div className="flex gap-2 flex-wrap mb-4">
                  <button
                    onClick={() => setTechSubjectFilter(null)}
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      techSubjectFilter === null ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'
                    }`}
                  >
                    All ({detail.technical.total})
                  </button>
                  {subjects.map((s) => {
                    const meta = SUBJECT_META[s] || { icon: '📌', label: s, color: 'bg-gray-100 text-gray-700' };
                    return (
                      <button
                        key={s}
                        onClick={() => setTechSubjectFilter(s)}
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          techSubjectFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'
                        }`}
                      >
                        {meta.icon} {meta.label} ({detail.technical.bySubject[s].length})
                      </button>
                    );
                  })}
                </div>
              )}

              {Object.entries(visibleTechnical).map(([subject, questions]) => {
                const meta = SUBJECT_META[subject] || { icon: '📌', label: subject, color: 'bg-gray-100 text-gray-700' };
                return (
                  <div key={subject} className="mb-6">
                    <h3 className={`inline-flex items-center gap-2 text-sm font-black px-3 py-1 rounded-full mb-3 ${meta.color}`}>
                      <span>{meta.icon}</span> {meta.label}
                    </h3>
                    <div className="space-y-2">
                      {questions.map((q) => {
                        const open = expandedTechnical.has(q.id);
                        return (
                          <div key={q.id} className="bg-white rounded-xl shadow">
                            <button
                              onClick={() => toggleTech(q.id)}
                              className="w-full text-left px-4 py-3 flex items-start gap-3"
                            >
                              <span className="mt-0.5 text-indigo-500 font-black">{open ? '▾' : '▸'}</span>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-800">{q.question}</div>
                                <div className="mt-1 flex gap-2 items-center text-[11px]">
                                  <span className={`font-bold ${DIFFICULTY_COLOR[q.difficulty] || 'text-gray-500'}`}>
                                    {q.difficulty}
                                  </span>
                                  {q.tags.slice(0, 3).map((t) => (
                                    <span key={t} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </button>
                            {open && q.answerHint && (
                              <div className="px-4 pb-4 pt-1 border-t border-gray-100 text-sm text-gray-700 leading-relaxed">
                                <div className="text-[11px] font-bold text-indigo-600 uppercase mb-2">
                                  Talking points
                                </div>
                                {renderMarkdown(q.answerHint)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'hr' && (
        <div>
          {detail.hr.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
              No HR prompts tagged for {detail.company.name}. Browse the general{' '}
              <span className="font-bold text-indigo-600">HR Prep</span> bank in the left nav.
            </div>
          ) : (
            <>
              {hrCategories.length > 1 && (
                <div className="flex gap-2 flex-wrap mb-4">
                  <button
                    onClick={() => setHrCategoryFilter(null)}
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      hrCategoryFilter === null ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'
                    }`}
                  >
                    All ({detail.hr.length})
                  </button>
                  {hrCategories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setHrCategoryFilter(c)}
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        hrCategoryFilter === c ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'
                      }`}
                    >
                      {c} ({detail.hr.filter((h) => h.category === c).length})
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {visibleHr.map((q) => {
                  const open = expandedHr.has(q.id);
                  return (
                    <div key={q.id} className="bg-white rounded-xl shadow">
                      <button onClick={() => toggleHr(q.id)} className="w-full text-left px-4 py-3 flex items-start gap-3">
                        <span className="mt-0.5 text-indigo-500 font-black">{open ? '▾' : '▸'}</span>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{q.question}</div>
                          <div className="mt-1 text-[11px] text-gray-500 uppercase font-bold">{q.category}</div>
                        </div>
                      </button>
                      {open && (
                        <div className="px-4 pb-4 pt-1 border-t border-gray-100 text-sm text-gray-700 leading-relaxed space-y-3">
                          <div>
                            <div className="text-[11px] font-bold text-indigo-600 uppercase mb-1">STAR Guidance</div>
                            {renderMarkdown(q.starGuidance)}
                          </div>
                          {q.sampleOutline && (
                            <div>
                              <div className="text-[11px] font-bold text-emerald-600 uppercase mb-1">Answer Outline</div>
                              {renderMarkdown(q.sampleOutline)}
                            </div>
                          )}
                          <button
                            onClick={() => onPracticeHr(q, detail.company.slug)}
                            className="text-xs font-bold px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                          >
                            🎤 Practice with AI
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
