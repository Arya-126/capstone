import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// Simple recent-reports list. Reachable via the LeftNav so users can
// find their comprehensive reports even before every finish-screen has
// been wired to link directly. Click a row → opens TestReport.

interface ReportRow {
  id: string;
  sourceType: string;
  sourceId: string;
  overallScore: number;
  createdAt: string;
  weakConcepts: { concept: string; subject: string; missCount: number }[];
}

const SOURCE_LABEL: Record<string, string> = {
  'aptitude-quiz': '🧮 Aptitude',
  'core-cs-quiz': '🖥️ Core CS',
  'ai-interview': '🤖 AI Interview',
  'coding-round': '⚡ Coding',
};

export const ReportsInbox: React.FC<{
  onOpen: (reportId: string) => void;
}> = ({ onOpen }) => {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<ReportRow[]>('/reports?limit=30')
      .then(setRows)
      .catch(() => setError('Failed to load reports'));
  }, []);

  if (error) return <div className="max-w-2xl mx-auto py-10 text-red-700">{error}</div>;
  if (rows === null) return <div className="max-w-2xl mx-auto py-16 text-center text-gray-400 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <h1 className="text-2xl font-black text-gray-900 mb-1">Comprehensive Reports</h1>
      <p className="text-sm text-gray-500 mb-6">
        Detailed analysis of every quiz and interview — with per-mistake explanations
        and AI-generated synopses for weak concepts.
      </p>

      {rows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          <div className="text-4xl mb-2">📭</div>
          <div className="font-bold">No reports yet</div>
          <div className="text-xs mt-1">Take any quiz or interview — a comprehensive report is generated automatically.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const pct = Math.round(r.overallScore);
            const scoreColor = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
            const weakCount = (r.weakConcepts || []).length;
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full text-left bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-0.5">
                    {SOURCE_LABEL[r.sourceType] || r.sourceType}
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(r.createdAt).toLocaleString()}
                    {weakCount > 0 && (
                      <span className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                        ⚠ {weakCount} weak concept{weakCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className={`text-2xl font-black ${scoreColor}`}>{pct}</div>
                <span className="text-gray-400">→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
