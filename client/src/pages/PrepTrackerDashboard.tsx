import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface RadarData {
  labels: string[];
  baselineScores: number[];
  currentScores: number[];
}

interface SummaryStats {
  overallAverage: number;
  improvementPct: number;
  totalInterviews: number;
  totalDrives: number;
}

interface PlacementDrive {
  id: string;
  currentStep: string;
  status: string;
  overallScore: number | null;
  overallVerdict: string | null;
  startedAt: string;
  company?: { name: string } | null;
}

interface StatsResponse {
  radar: RadarData;
  summary: SummaryStats;
  placementDrives: PlacementDrive[];
  activeQuests: any[];
}

export const PrepTrackerDashboard: React.FC<{
  onNavigate: (page: string) => void;
}> = ({ onNavigate }) => {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<StatsResponse>('/prep-tracker/stats')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // SVG Radar Polygon Math Generator
  const renderRadarSvg = (radar: RadarData) => {
    const size = 340;
    const center = size / 2;
    const radius = 120;
    const totalAxes = radar.labels.length;

    const getCoordinates = (score: number, index: number) => {
      const angle = (Math.PI * 2 * index) / totalAxes - Math.PI / 2;
      const r = (score / 100) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y };
    };

    // Concentric grid circles (20%, 40%, 60%, 80%, 100%)
    const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

    const baselinePoints = radar.baselineScores
      .map((score, i) => {
        const { x, y } = getCoordinates(score, i);
        return `${x},${y}`;
      })
      .join(' ');

    const currentPoints = radar.currentScores
      .map((score, i) => {
        const { x, y } = getCoordinates(score, i);
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto overflow-visible">
        {/* Grid Background Web */}
        {rings.map((pct, idx) => (
          <polygon
            key={idx}
            points={radar.labels
              .map((_, i) => {
                const { x, y } = getCoordinates(pct * 100, i);
                return `${x},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="#e2e8f0"
            strokeDasharray={idx === 4 ? '0' : '3 3'}
            strokeWidth={idx === 4 ? '1.5' : '1'}
          />
        ))}

        {/* Axes Lines */}
        {radar.labels.map((_, i) => {
          const { x, y } = getCoordinates(100, i);
          return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#cbd5e1" strokeWidth="1" />;
        })}

        {/* Baseline Polygon (Gray/Indigo Dashed) */}
        <polygon points={baselinePoints} fill="rgba(99, 102, 241, 0.08)" stroke="#818cf8" strokeWidth="2" strokeDasharray="4 4" />

        {/* Current Polygon (Vibrant Emerald) */}
        <polygon points={currentPoints} fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="3" />

        {/* Vertices Dots */}
        {radar.currentScores.map((score, i) => {
          const { x, y } = getCoordinates(score, i);
          return <circle key={i} cx={x} cy={y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />;
        })}

        {/* Axis Labels */}
        {radar.labels.map((label, i) => {
          const { x, y } = getCoordinates(125, i);
          const currentVal = radar.currentScores[i];
          return (
            <g key={i}>
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-black fill-slate-700"
              >
                {label}
              </text>
              <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-extrabold fill-emerald-600"
              >
                {currentVal}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => onNavigate('dashboard')} className="text-indigo-600 font-bold mb-1 hover:underline">
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-gray-900">📊 Placement Prep Analytics & Skill Radar</h1>
          <p className="text-sm text-gray-600">
            Multi-axis competency radar, baseline improvement tracker, and placement drive history.
          </p>
        </div>

        <button
          onClick={() => onNavigate('placement-drive')}
          className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition shadow"
        >
          🚀 Start Placement Drive
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading placement analytics…</div>
      ) : !data ? (
        <div className="text-center py-16 text-red-500">Failed to load analytics data.</div>
      ) : (
        <div className="space-y-8">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Overall Readiness</span>
              <div className="text-3xl font-black text-indigo-600">{data.summary.overallAverage}%</div>
              <span className="text-[10px] text-gray-500 block font-semibold mt-1">Average Across 6 Axes</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Skill Growth</span>
              <div className="text-3xl font-black text-emerald-500">+{data.summary.improvementPct}%</div>
              <span className="text-[10px] text-gray-500 block font-semibold mt-1">Vs. Baseline Attempts</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Mock Interviews</span>
              <div className="text-3xl font-black text-slate-800">{data.summary.totalInterviews}</div>
              <span className="text-[10px] text-gray-500 block font-semibold mt-1">Rounds Completed</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Placement Drives</span>
              <div className="text-3xl font-black text-violet-600">{data.summary.totalDrives}</div>
              <span className="text-[10px] text-gray-500 block font-semibold mt-1">Full Drives Completed</span>
            </div>
          </div>

          {/* Main Grid: Radar Chart + Legend & Quests */}
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* SVG Radar Chart Box */}
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Competency Skill Radar</h2>
                  <p className="text-xs text-gray-500">Multi-axis proficiency mapping</p>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Current</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block opacity-50" />
                    <span>Baseline</span>
                  </div>
                </div>
              </div>

              {renderRadarSvg(data.radar)}
            </div>

            {/* Right Column: Breakdown & Active Quests */}
            <div className="space-y-6">
              {/* Category Breakdown list */}
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                <h2 className="text-lg font-black text-gray-900 mb-4">Competency Breakdown</h2>
                <div className="space-y-3">
                  {data.radar.labels.map((lbl, idx) => {
                    const currentVal = data.radar.currentScores[idx];
                    const baselineVal = data.radar.baselineScores[idx];
                    const diff = currentVal - baselineVal;

                    return (
                      <div key={lbl} className="flex justify-between items-center border-b pb-2 text-xs">
                        <span className="font-bold text-gray-800">{lbl}</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-gray-400 line-through">{baselineVal}%</span>
                          <span className="font-black text-emerald-600 text-sm">{currentVal}%</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${diff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {diff >= 0 ? `+${diff}%` : `${diff}%`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Quests Widget */}
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-black text-gray-900">Active Learning Quests</h2>
                  <button onClick={() => onNavigate('quests-hub')} className="text-xs font-bold text-indigo-600 hover:underline">
                    View All →
                  </button>
                </div>

                {data.activeQuests.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No active quests. Take a mock interview to generate quests!</p>
                ) : (
                  <div className="space-y-2">
                    {data.activeQuests.slice(0, 3).map((q) => (
                      <div key={q.id} className="p-3 bg-slate-50 rounded-xl border border-gray-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-black text-gray-900">{q.title}</div>
                          <div className="text-[10px] text-gray-500">Reward: +{q.xpReward} XP</div>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                          {q.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Placement Drives History Table */}
          <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
            <h2 className="text-lg font-black text-gray-900 mb-4">Past Placement Drive Attempts</h2>
            {data.placementDrives.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">No completed placement drives yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-400 font-bold uppercase">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Pattern</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Overall Score</th>
                      <th className="pb-2">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.placementDrives.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-3 font-semibold text-gray-700">
                          {new Date(d.startedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 font-bold text-gray-900">
                          {d.company ? d.company.name : 'Generic Drive'}
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700">
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3 font-black text-indigo-600">
                          {d.overallScore != null ? `${d.overallScore}/100` : '—'}
                        </td>
                        <td className="py-3">
                          <span className="px-2.5 py-0.5 text-[10px] font-black rounded bg-emerald-100 text-emerald-800">
                            {d.overallVerdict || 'Needs Practice'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
