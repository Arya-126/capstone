import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';

interface Turn {
  order: number;
  role: 'INTERVIEWER' | 'CANDIDATE';
  content: string;
  turnScore?: number;
  feedback?: string;
  starBreakdown?: {
    situation?: { present: boolean; quality: string };
    task?: { present: boolean; quality: string };
    action?: { present: boolean; quality: string };
    result?: { present: boolean; quality: string };
  };
  isFollowup?: boolean;
}

interface DeliverySignals {
  avgWpm: number;
  totalFillers: number;
  voiceAnswers: number;
  answers: { wpm: number; words: number; durationSec: number; fillers: number }[];
}

interface Interview {
  id: string;
  role: string;
  roundType?: string;
  company: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string;
  overallScore: number | null;
  rubricScores: Record<string, number> | null;
  summary: { strengths: string[]; gaps: string[]; nextSteps: string[] } | null;
  proctoringSummary?: Record<string, number> | null;
  deliverySignals?: DeliverySignals | null;
  resumeData?: {
    name?: string;
    skills?: string[];
    projects?: { title: string; tech?: string[]; description?: string }[];
    internships?: { company: string; role?: string }[];
  } | null;
  maxQuestions: number;
  turns: Turn[];
}

const ROLES = ['SDE (Generalist)', 'Backend Engineer', 'Frontend Engineer', 'Data Analyst', 'DevOps Engineer'];

const RUBRIC_LABELS: Record<string, string> = {
  technical: 'Technical correctness',
  communication: 'Communication',
  structure: 'Structure & Coherence',
  problemSolving: 'Problem solving',
  roleFit: 'Role fit',
  starStructure: 'STAR Method Structure',
  selfAwareness: 'Self-Awareness & Reflection',
  cultureFit: 'Culture Fit & Motivation',
  professionalism: 'Professionalism & Maturity',
};

export const InterviewChat: React.FC<{
  onBack: () => void;
  onStartVideo?: (role: string, companyId: string | null, roundType: string, resumeData?: any) => void;
  onStartCoding?: (role: string, companyId: string | null) => void;
  initialInterviewId?: string | null;
}> = ({ onBack, onStartVideo, onStartCoding, initialInterviewId }) => {
  const [past, setPast] = useState<any[]>([]);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [role, setRole] = useState(ROLES[0]);
  const [roundType, setRoundType] = useState<'hr' | 'technical' | 'coding'>('technical');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume Upload State
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [parsedResume, setParsedResume] = useState<any | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get<any[]>('/ai-interview').then(setPast).catch(() => {});
    apiClient.get<{ id: string; name: string }[]>('/companies').then(setCompanies).catch(() => {});

    if (initialInterviewId) {
      apiClient.get<Interview>(`/ai-interview/${initialInterviewId}`).then(setInterview).catch(() => {});
    }
  }, [initialInterviewId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interview?.turns]);

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF format resume.');
      return;
    }
    setResumeFile(file);
    setResumeParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = reader.result as string;
        const res = await apiClient.post<any>('/ai-interview/parse-resume', { pdfBase64: b64 });
        setParsedResume(res);
      } catch {
        setError('Could not extract text from PDF. You can still proceed.');
      } finally {
        setResumeParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const iv = await apiClient.post<Interview>('/ai-interview/start', {
        role,
        roundType,
        ...(companyId ? { companyId } : {}),
        ...(parsedResume ? { resumeData: parsedResume } : {}),
      });
      setInterview(iv);
      setPast((prev) => [iv, ...prev]);
    } catch {
      setError('Could not start the interview — check server logs.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!interview || !draft.trim() || busy) return;
    const text = draft;
    setDraft('');
    setBusy(true);
    try {
      const updated = await apiClient.post<Interview>(`/ai-interview/${interview.id}/reply`, {
        content: text,
      });
      setInterview(updated);
    } catch {
      setError('Failed to send answer');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!interview || busy) return;
    setBusy(true);
    try {
      const scored = await apiClient.post<Interview>(`/ai-interview/${interview.id}/finish`, {});
      setInterview(scored);
    } catch {
      setError('Failed to finish & score');
    } finally {
      setBusy(false);
    }
  };

  // ---- report view ----
  if (interview && interview.status === 'COMPLETED') {
    const rubric = interview.rubricScores || {};
    const isHr = interview.roundType === 'hr';
    const rd = interview.resumeData;

    return (
      <div className="max-w-3xl mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600">
              {isHr ? '🗣 HR & Behavioral Report' : '💻 Resume-Aware Technical Report'}
            </span>
            <h1 className="text-3xl font-black">{interview.role} Mock Interview</h1>
            <p className="text-sm text-gray-500">
              {interview.company ? `Company pattern: ${interview.company}` : 'Standard Interview'}{interview.startedAt ? ` · ${new Date(interview.startedAt).toLocaleDateString()}` : ''}
            </p>
          </div>
          <button onClick={() => setInterview(null)} className="btn-secondary">
            Back to Home
          </button>
        </div>

        {/* Scorecard */}
        <div className="bg-white p-6 rounded-2xl shadow-xl mb-6 flex flex-col md:flex-row items-center gap-6">
          <div className="text-center md:border-r pr-6">
            <div className="text-5xl font-black text-indigo-600">
              {interview.overallScore != null ? interview.overallScore : '—'}
            </div>
            <div className="text-xs font-bold text-gray-400 uppercase mt-1">Overall Score / 100</div>
          </div>

          <div className="flex-1 w-full space-y-2">
            {Object.keys(rubric).map((key) => (
              <div key={key} className="text-sm">
                <div className="flex justify-between font-bold text-gray-700">
                  <span>{RUBRIC_LABELS[key] || key}</span>
                  <span>{rubric[key]}/5</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${(((rubric as any)[key] || 0) / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resume Insights Card */}
        {rd && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl mb-6 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📄</span>
              <h2 className="font-black text-lg">Resume Insights Probed</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-300">
              <div>
                <span className="font-bold text-slate-400 block mb-1">Key Skills Extracted:</span>
                <div className="flex flex-wrap gap-1">
                  {(rd.skills || []).map((sk) => (
                    <span key={sk} className="bg-indigo-900/60 border border-indigo-700/50 text-indigo-200 px-2 py-0.5 rounded font-mono">
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-400 block mb-1">Projects Discussed:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {(rd.projects || []).map((p) => (
                    <li key={p.title}>
                      <b>{p.title}</b> {p.tech?.length ? `(${p.tech.join(', ')})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {interview.proctoringSummary &&
          Object.entries(interview.proctoringSummary).some(([k, v]) => k !== 'faceChecks' && v > 0) && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 text-sm">
            <b>📷 Camera signal:</b>{' '}
            {Object.entries(interview.proctoringSummary)
              .filter(([k, v]) => k !== 'faceChecks' && v > 0)
              .map(([k, v]) => `${k.split('_').join(' ').toLowerCase()} ×${v}`)
              .join(' · ')}
          </div>
        )}

        {interview.summary && (
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {([['💪 Strengths', interview.summary.strengths], ['🕳 Gaps', interview.summary.gaps], ['🧭 Next steps', interview.summary.nextSteps]] as const).map(([title, items]) => (
              <div key={title} className="bg-white p-5 rounded-xl shadow">
                <h2 className="font-black mb-2">{title}</h2>
                <ul className="text-sm space-y-1 list-disc pl-4 text-gray-600">
                  {(items || []).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        <h2 className="font-black text-xl mb-3">Transcript & per-answer feedback</h2>
        {interview.turns.map((t) => (
          <div key={t.order} className={`mb-4 flex ${t.role === 'CANDIDATE' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] p-4 rounded-2xl text-sm ${
              t.role === 'CANDIDATE' ? 'bg-indigo-50 border border-indigo-100 text-gray-900' : 'bg-white shadow'
            }`}>
              <div className="text-[10px] font-black text-gray-400 uppercase mb-1">
                {t.role === 'CANDIDATE' ? 'YOU' : 'INTERVIEWER'}
                {t.isFollowup && <span className="ml-1 text-amber-600">· FOLLOW-UP</span>}
              </div>
              {t.content}

              {/* STAR Breakdown for HR */}
              {t.starBreakdown && (
                <div className="mt-3 pt-3 border-t border-indigo-100">
                  <div className="text-xs font-black text-gray-700 mb-1.5">STAR Method Breakdown:</div>
                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                    {['situation', 'task', 'action', 'result'].map((step) => {
                      const item = (t.starBreakdown as any)[step];
                      const present = item?.present ?? false;
                      const quality = item?.quality || 'missing';
                      return (
                        <div
                          key={step}
                          className={`p-1.5 rounded font-bold uppercase text-[10px] ${
                            present
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {step}
                          <span className="block font-normal text-[9px] lowercase text-gray-600">
                            {present ? quality : 'missing'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {t.feedback && (
                <div className="mt-2 pt-2 border-t text-xs text-amber-800">
                  <b>Feedback{t.turnScore != null ? ` (${t.turnScore}/5)` : ''}:</b> {t.feedback}
                </div>
              )}
            </div>
          </div>
        ))}
        <button onClick={onBack} className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 my-6">
          Done
        </button>
      </div>
    );
  }

  // ---- live chat ----
  if (interview) {
    const questionsAsked = interview.turns.filter((t) => t.role === 'INTERVIEWER' && !t.isFollowup).length;
    return (
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="flex justify-between items-center mb-3">
          <div className="font-black">
            {interview.roundType === 'hr' ? '🗣 HR Round' : '🤖 Technical Round'} — {interview.role} ({Math.min(questionsAsked, interview.maxQuestions)}/{interview.maxQuestions})
          </div>
          <button onClick={finish} disabled={busy} className="text-sm font-bold text-red-600 disabled:opacity-40">
            End & score now
          </button>
        </div>
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-2 text-sm">{error}</div>}
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          {interview.turns.map((t) => (
            <div key={t.order} className={`flex ${t.role === 'CANDIDATE' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                t.role === 'CANDIDATE' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white shadow rounded-bl-sm'
              }`}>
                {t.isFollowup && <span className="block text-[9px] font-black text-amber-600 uppercase mb-1">Follow-up</span>}
                {t.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-gray-400 text-sm italic">interviewer is typing…</div>}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 pt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="flex-1 border rounded-xl px-4 py-3 text-sm resize-none"
          />
          <button onClick={send} disabled={busy || !draft.trim()}
            className="px-5 rounded-xl font-black text-white bg-indigo-600 disabled:opacity-40">
            ➤
          </button>
        </div>
      </div>
    );
  }

  // ---- role & round picker ----
  return (
    <div className="max-w-xl mx-auto">
      <button onClick={onBack} className="text-indigo-600 font-bold mb-4">← Back to Dashboard</button>
      <div className="bg-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-black mb-2">🤖 AI Mock Interview</h1>
        <p className="text-sm text-gray-600 mb-6">
          Adaptive AI interview with rubric-scored feedback, STAR structure evaluation, and full transcript analysis.
        </p>

        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Select Round Type</label>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setRoundType('hr')}
            className={`p-3 rounded-xl border-2 text-left transition ${
              roundType === 'hr' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-lg mb-1">🗣️</div>
            <div className="font-black text-gray-900 text-xs">HR Round</div>
            <div className="text-[10px] text-gray-500">STAR method</div>
          </button>

          <button
            type="button"
            onClick={() => setRoundType('technical')}
            className={`p-3 rounded-xl border-2 text-left transition ${
              roundType === 'technical' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-lg mb-1">💻</div>
            <div className="font-black text-gray-900 text-xs">Technical</div>
            <div className="text-[10px] text-gray-500">Resume + CS</div>
          </button>

          <button
            type="button"
            onClick={() => setRoundType('coding')}
            className={`p-3 rounded-xl border-2 text-left transition ${
              roundType === 'coding' ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-lg mb-1">⚡</div>
            <div className="font-black text-gray-900 text-xs">Coding Round</div>
            <div className="text-[10px] text-gray-500">Live Code Room</div>
          </button>
        </div>

        {roundType === 'coding' && (
          <button
            onClick={() => onStartCoding?.(role, companyId || null)}
            className="w-full py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 mb-4 shadow hover:opacity-95 transition"
          >
            ⚡ Launch Live Coding Environment
          </button>
        )}

        {/* Resume Upload Card for Technical Round */}
        {roundType === 'technical' && (
          <div className="mb-5 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600 uppercase">Attach Resume (Optional PDF)</span>
              {parsedResume && <span className="text-xs font-bold text-emerald-600">✓ Resume parsed</span>}
            </div>
            <input
              type="file"
              accept=".pdf"
              onChange={handleResumeChange}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {resumeParsing && <p className="text-xs text-indigo-600 font-semibold mt-2 animate-pulse">Extracting projects & skills from PDF…</p>}
            {parsedResume && (
              <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded border">
                <b>Parsed:</b> {parsedResume.skills?.slice(0, 5).join(', ')}... ({parsedResume.projects?.length || 0} projects)
              </div>
            )}
          </div>
        )}

        <label className="text-xs font-bold text-gray-500 block mb-1">Target role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 font-bold mb-4">
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>

        <label className="text-xs font-bold text-gray-500 block mb-1">Company style (optional)</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 font-bold mb-5">
          <option value="">Generic interviewer</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-3 text-sm">{error}</div>}

        {onStartVideo && (
          <button onClick={() => onStartVideo(role, companyId || null, roundType, parsedResume)}
            className="w-full py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 mb-3 shadow hover:opacity-95 transition">
            📹 Start Face-to-Face Interview (Voice + Avatar)
          </button>
        )}

        <button onClick={start} disabled={busy || resumeParsing}
          className="w-full py-3.5 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-40 shadow hover:opacity-95 transition">
          {busy ? 'Setting up…' : '💬 Start Text Interview'}
        </button>
      </div>

      {past.length > 0 && (
        <div className="mt-6">
          <h2 className="font-black mb-2">Past interviews</h2>
          {past.map((p) => (
            <button key={p.id}
              onClick={() => apiClient.get<Interview>(`/ai-interview/${p.id}`).then(setInterview)}
              className="w-full text-left bg-white p-4 rounded-xl shadow mb-2 hover:bg-indigo-50 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-gray-900">{p.role}</span>
                <span className="text-xs font-black uppercase text-indigo-600 ml-2">
                  {p.roundType === 'hr' ? 'HR' : 'Technical'}
                </span>
                <div className="text-xs text-gray-500">
                  {p.startedAt ? new Date(p.startedAt).toLocaleString() : ''} · {p.status}
                </div>
              </div>
              {p.overallScore != null && (
                <div className="text-right">
                  <span className="text-lg font-black text-indigo-600">{p.overallScore}</span>
                  <span className="text-xs text-gray-400">/100</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
