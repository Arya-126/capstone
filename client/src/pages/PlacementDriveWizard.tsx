import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { InterviewRoom } from './InterviewRoom';
import { CodingInterviewRoom } from './CodingInterviewRoom';

interface Drive {
  id: string;
  status: string;
  currentStep: string;
  resumeData?: any;
  overallScore?: number;
  overallVerdict?: string;
  company?: { name: string } | null;
}

interface Interview {
  id: string;
  roundType: string;
  role: string;
  overallScore: number | null;
  rubricScores: Record<string, number> | null;
  summary: any;
}

export const PlacementDriveWizard: React.FC<{
  onExit: () => void;
  onNavigateQuests: () => void;
}> = ({ onExit, onNavigateQuests }) => {
  const [drive, setDrive] = useState<Drive | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [role, setRole] = useState('SDE (Generalist)');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loading, setLoading] = useState(false);

  // Resume Upload State
  const [resumeParsing, setResumeParsing] = useState(false);
  const [parsedResume, setParsedResume] = useState<any | null>(null);

  // Active sub-interview ID for HR / Tech / Coding steps
  const [activeSubRound, setActiveSubRound] = useState<'hr' | 'technical' | 'coding' | null>(null);

  useEffect(() => {
    apiClient.get<{ id: string; name: string }[]>('/companies').then(setCompanies).catch(() => {});
  }, []);

  const startDrive = async () => {
    setLoading(true);
    try {
      const newDrive = await apiClient.post<Drive>('/placement-drive/start', {
        companyId: selectedCompanyId || undefined,
        role,
      });
      setDrive(newDrive);
    } catch {
      alert('Could not initialize placement drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !drive) return;
    setResumeParsing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = reader.result as string;
        const parsed = await apiClient.post<any>('/ai-interview/parse-resume', { pdfBase64: b64 });
        setParsedResume(parsed);
        const updated = await apiClient.post<Drive>(`/placement-drive/${drive.id}/resume`, { resumeData: parsed });
        setDrive(updated);
        setResumeParsing(false);
      };
      reader.readAsDataURL(file);
    } catch {
      alert('Failed to parse resume PDF.');
      setResumeParsing(false);
    }
  };

  const startRound = async (roundType: 'hr' | 'technical' | 'coding') => {
    if (!drive) return;
    setLoading(true);
    try {
      await apiClient.post(`/placement-drive/${drive.id}/start-round`, {
        roundType,
        role,
      });
      setActiveSubRound(roundType);
    } catch {
      alert(`Could not start ${roundType} round.`);
    } finally {
      setLoading(false);
    }
  };

  const finishCurrentRound = async () => {
    setActiveSubRound(null);
    if (!drive) return;
    try {
      const res = await apiClient.get<{ drive: Drive; interviews: Interview[] }>(`/placement-drive/${drive.id}`);
      setDrive(res.drive);
      setInterviews(res.interviews);
    } catch {
      /* fallback */
    }
  };

  const completeDriveAndShowReport = async () => {
    if (!drive) return;
    setLoading(true);
    try {
      const res = await apiClient.post<{ drive: Drive; interviews: Interview[] }>(`/placement-drive/${drive.id}/complete`, {});
      setDrive(res.drive);
      setInterviews(res.interviews);
    } catch {
      alert('Failed to calculate placement drive report.');
    } finally {
      setLoading(false);
    }
  };

  // Sub-round interview views
  if (activeSubRound === 'hr' || activeSubRound === 'technical') {
    return (
      <InterviewRoom
        role={role}
        roundType={activeSubRound}
        companyId={selectedCompanyId}
        resumeData={parsedResume}
        onExit={finishCurrentRound}
        onComplete={() => finishCurrentRound()}
      />
    );
  }

  if (activeSubRound === 'coding') {
    return (
      <CodingInterviewRoom
        role={role}
        companyId={selectedCompanyId}
        onExit={finishCurrentRound}
        onComplete={() => finishCurrentRound()}
      />
    );
  }

  const steps = [
    { key: 'resume', label: '1. Resume Upload' },
    { key: 'hr', label: '2. HR Round' },
    { key: 'technical', label: '3. Technical Round' },
    { key: 'coding', label: '4. Live Coding' },
    { key: 'report', label: '5. Unified Report' },
  ];

  const getStepIndex = (stepKey: string) => steps.findIndex((s) => s.key === stepKey);
  const currentIdx = drive ? getStepIndex(drive.currentStep) : -1;

  return (
    <div className="max-w-5xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={onExit} className="text-indigo-600 font-bold mb-1 hover:underline">
            ← Exit Placement Drive
          </button>
          <h1 className="text-3xl font-black text-gray-900">🚀 Campus Placement Drive Simulation</h1>
          <p className="text-sm text-gray-600">
            Complete multi-round placement evaluation: Resume → HR → Technical → Coding → Unified Scorecard.
          </p>
        </div>
      </div>

      {/* Step Tracker Bar */}
      {drive && (
        <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 mb-8 flex items-center justify-between">
          {steps.map((s, idx) => {
            const isActive = drive.currentStep === s.key;
            const isDone = currentIdx > idx || drive.status === 'COMPLETED';

            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isActive
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-xs font-bold ${
                    isActive ? 'text-indigo-600' : isDone ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Initial Setup Screen */}
      {!drive && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-xl mx-auto">
          <h2 className="text-2xl font-black mb-2 text-gray-900">Configure Placement Drive</h2>
          <p className="text-sm text-gray-600 mb-6">
            Simulate a full placement drive tailored to your target company's pattern and expectations.
          </p>

          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Target Role</label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 font-bold mb-4"
          />

          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Company Pattern (Optional)</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 font-bold mb-6"
          >
            <option value="">Generic Placement Drive</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={startDrive}
            disabled={loading}
            className="w-full py-4 rounded-xl font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg hover:opacity-95 transition"
          >
            {loading ? 'Initializing Drive…' : '🏁 Start Placement Drive'}
          </button>
        </div>
      )}

      {/* Step 1: Resume Upload */}
      {drive && drive.currentStep === 'resume' && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-xl mx-auto text-center">
          <span className="text-4xl mb-3 block">📄</span>
          <h2 className="text-2xl font-black mb-2 text-gray-900">Upload Resume (PDF)</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your resume will be parsed to generate custom technical questions probing your claimed projects and skills.
          </p>

          <input
            type="file"
            accept=".pdf"
            onChange={handleResumeUpload}
            className="block w-full text-xs text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mb-4"
          />

          {resumeParsing && (
            <p className="text-xs text-indigo-600 font-bold animate-pulse my-2">Extracting skills and projects from PDF…</p>
          )}

          <div className="pt-4 border-t flex gap-3">
            <button
              onClick={() => {
                apiClient.post<Drive>(`/placement-drive/${drive.id}/resume`, { resumeData: null }).then(setDrive);
              }}
              className="flex-1 py-3 border border-slate-300 font-bold text-slate-600 rounded-xl text-xs"
            >
              Skip Resume Step
            </button>
          </div>
        </div>
      )}

      {/* Step 2: HR Round */}
      {drive && drive.currentStep === 'hr' && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-xl mx-auto text-center">
          <span className="text-4xl mb-3 block">🗣️</span>
          <h2 className="text-2xl font-black mb-2 text-gray-900">Round 1: HR & Behavioral Interview</h2>
          <p className="text-sm text-gray-600 mb-6">
            6-question behavioral interview evaluated using the STAR structure rubric.
          </p>
          <button
            onClick={() => startRound('hr')}
            className="w-full py-4 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-lg"
          >
            ▶ Launch HR Round
          </button>
        </div>
      )}

      {/* Step 3: Technical Round */}
      {drive && drive.currentStep === 'technical' && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-xl mx-auto text-center">
          <span className="text-4xl mb-3 block">💻</span>
          <h2 className="text-2xl font-black mb-2 text-gray-900">Round 2: Resume-Aware Technical Round</h2>
          <p className="text-sm text-gray-600 mb-6">
            Deep technical questions probing your resume projects + Core CS fundamentals (OS, DBMS, CN, SQL).
          </p>
          <button
            onClick={() => startRound('technical')}
            className="w-full py-4 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-lg"
          >
            ▶ Launch Technical Round
          </button>
        </div>
      )}

      {/* Step 4: Coding Round */}
      {drive && drive.currentStep === 'coding' && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-xl mx-auto text-center">
          <span className="text-4xl mb-3 block">⚡</span>
          <h2 className="text-2xl font-black mb-2 text-gray-900">Round 3: Live Coding Round</h2>
          <p className="text-sm text-gray-600 mb-6">
            Full-screen code execution environment with live test runner, timer, and AI code review.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => startRound('coding')}
              className="w-full py-4 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg"
            >
              ▶ Launch Live Coding Environment
            </button>
            <button
              onClick={completeDriveAndShowReport}
              className="w-full py-3 border border-slate-300 font-bold text-slate-600 rounded-xl text-xs"
            >
              Finish Drive & Generate Report Now
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Unified Placement Drive Report */}
      {drive && (drive.currentStep === 'report' || drive.status === 'COMPLETED') && (
        <div className="space-y-6">
          {/* Main Verdict Card */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-8 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center gap-8">
            <div className="text-center md:border-r border-slate-700 pr-8">
              <div className="text-6xl font-black text-indigo-400">
                {drive.overallScore != null ? drive.overallScore : '—'}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                Placement Drive Score / 100
              </div>
            </div>

            <div className="flex-1 space-y-2 text-center md:text-left">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                Placement Readiness Verdict
              </span>
              <h2 className="text-3xl font-black">{drive.overallVerdict || 'Needs Practice'}</h2>
              <p className="text-xs text-slate-300">
                Target Role: <b>{role}</b> {drive.company ? `· Pattern: ${drive.company.name}` : ''}
              </p>
            </div>

            <button
              onClick={onNavigateQuests}
              className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl text-xs shadow-lg transition"
            >
              🎯 View Auto-Generated Quests
            </button>
          </div>

          {/* Individual Round Breakdown */}
          <div className="grid md:grid-cols-3 gap-6">
            {interviews.map((iv) => (
              <div key={iv.id} className="bg-white p-6 rounded-2xl shadow border border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black uppercase text-indigo-600">
                    {iv.roundType} Round
                  </span>
                  <span className="text-xl font-black text-gray-900">
                    {iv.overallScore != null ? `${iv.overallScore}/100` : '—'}
                  </span>
                </div>

                {iv.rubricScores && (
                  <div className="space-y-1.5 text-xs text-gray-600">
                    {Object.entries(iv.rubricScores).map(([k, v]) => (
                      <div key={k} className="flex justify-between font-semibold">
                        <span className="capitalize">{k}</span>
                        <span>{v}/5</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
