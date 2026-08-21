import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface CoreQuestion {
  id: string;
  subject: string;
  question: string;
  options: string[];
  explanation: string;
  difficulty: string;
}

interface QuizResult {
  score: number;
  total: number;
  percentage: number;
  xpEarned: number;
  details: {
    questionId: string;
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
  }[];
}

const SUBJECT_INFO: Record<string, { title: string; icon: string; bg: string; border: string; desc: string }> = {
  CN: {
    title: 'Computer Networks',
    icon: '🌐',
    bg: 'from-blue-500 to-cyan-600',
    border: 'border-blue-200',
    desc: 'OSI layers, TCP/IP, IP addressing, DNS, HTTP, socket programming & routing protocols.',
  },
  OS: {
    title: 'Operating Systems',
    icon: '💻',
    bg: 'from-purple-600 to-indigo-600',
    border: 'border-purple-200',
    desc: 'Process management, threads, CPU scheduling, deadlocks, memory management & paging.',
  },
  DBMS: {
    title: 'Database Systems (DBMS)',
    icon: '🗄️',
    bg: 'from-emerald-500 to-teal-600',
    border: 'border-emerald-200',
    desc: 'ER diagrams, Relational Algebra, Normalization (1NF to BCNF), Transactions & ACID.',
  },
  SQL: {
    title: 'SQL & Queries',
    icon: '⚡',
    bg: 'from-amber-500 to-orange-600',
    border: 'border-amber-200',
    desc: 'JOINs, GROUP BY, Aggregate functions, Subqueries, Indexing, Triggers & Stored Procedures.',
  },
};

export const CoreCsHub: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Active Quiz State
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<CoreQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    apiClient
      .get<{ subjects: Record<string, number> }>('/core-subjects/summary')
      .then((res) => setSummary(res.subjects || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startQuiz = async (subject: string) => {
    setActiveSubject(subject);
    setQuizLoading(true);
    setUserAnswers({});
    setQuizResult(null);
    try {
      const res = await apiClient.get<{ subject: string; questions: CoreQuestion[] }>(
        `/core-subjects/${subject}/quiz`
      );
      setQuestions(res.questions);
    } catch {
      alert('Failed to load quiz questions');
      setActiveSubject(null);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (quizResult) return; // frozen after submission
    setUserAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const submitQuiz = async () => {
    if (!activeSubject || !questions.length) return;
    const payload = questions.map((q) => ({
      questionId: q.id,
      selectedIndex: userAnswers[q.id] ?? -1,
    }));

    try {
      const res = await apiClient.post<QuizResult>('/core-subjects/submit-quiz', { answers: payload });
      setQuizResult(res);
    } catch {
      alert('Failed to submit quiz');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={onBack} className="text-indigo-600 font-bold mb-1 hover:underline">
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-gray-900">📚 Core CS Drill & Theory Hub</h1>
          <p className="text-sm text-gray-600">
            Master fundamental Computer Science subjects for placement written rounds and technical interviews.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading subject modules…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {Object.entries(SUBJECT_INFO).map(([code, info]) => (
            <div
              key={code}
              className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100 flex flex-col justify-between hover:shadow-xl transition"
            >
              <div className={`p-6 bg-gradient-to-r ${info.bg} text-white`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-3xl">{info.icon}</span>
                  <span className="bg-white/20 text-white font-black text-xs px-3 py-1 rounded-full uppercase">
                    {summary[code] || 0} Questions
                  </span>
                </div>
                <h3 className="text-xl font-black">{info.title}</h3>
                <p className="text-xs text-white/80 mt-1 leading-relaxed">{info.desc}</p>
              </div>

              <div className="p-5 bg-slate-50 border-t flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500">10-Question Drill Session</span>
                <button
                  onClick={() => startQuiz(code)}
                  className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition shadow"
                >
                  ⚡ Start Practice
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      {activeSubject && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 my-8 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b">
              <div>
                <span className="text-xs font-black uppercase text-indigo-600">
                  {SUBJECT_INFO[activeSubject]?.title} Drill
                </span>
                <h2 className="text-xl font-black">Practice Quiz (10 Questions)</h2>
              </div>
              <button
                onClick={() => setActiveSubject(null)}
                className="text-gray-400 hover:text-gray-600 font-black text-xl"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {quizLoading ? (
                <div className="text-center py-12 text-gray-400">Fetching questions…</div>
              ) : (
                questions.map((q, qIdx) => {
                  const userSel = userAnswers[q.id];
                  const detail = quizResult?.details.find((d) => d.questionId === q.id);

                  return (
                    <div key={q.id} className="bg-slate-50 p-5 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-xs text-gray-400 uppercase">
                          Question {qIdx + 1} / {questions.length}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                          {q.difficulty}
                        </span>
                      </div>
                      <p className="font-bold text-gray-900 text-sm mb-4">{q.question}</p>

                      <div className="space-y-2 mb-3">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = userSel === optIdx;
                          let btnStyle = 'bg-white border-gray-200 text-gray-700 hover:bg-indigo-50';

                          if (quizResult && detail) {
                            if (optIdx === detail.correctIndex) {
                              btnStyle = 'bg-emerald-100 border-emerald-400 text-emerald-900 font-bold';
                            } else if (isSelected && !detail.isCorrect) {
                              btnStyle = 'bg-red-100 border-red-400 text-red-900 font-bold';
                            }
                          } else if (isSelected) {
                            btnStyle = 'bg-indigo-600 border-indigo-600 text-white font-bold';
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => handleSelectOption(q.id, optIdx)}
                              className={`w-full text-left p-3 rounded-lg border text-xs transition flex items-center gap-3 ${btnStyle}`}
                            >
                              <span className="w-5 h-5 rounded-full border flex items-center justify-center font-bold text-[10px] shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {quizResult && detail && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700">
                          <b className={detail.isCorrect ? 'text-emerald-700' : 'text-red-700'}>
                            {detail.isCorrect ? '✓ Correct!' : '✕ Incorrect.'}
                          </b>{' '}
                          {detail.explanation}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t flex items-center justify-between">
              {quizResult ? (
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-black text-indigo-600">
                    {quizResult.percentage}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {quizResult.score} of {quizResult.total} correct (+{quizResult.xpEarned} XP)
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 font-semibold">
                  {Object.keys(userAnswers).length} of {questions.length} answered
                </div>
              )}

              {quizResult ? (
                <button
                  onClick={() => setActiveSubject(null)}
                  className="px-6 py-2.5 bg-indigo-600 text-white font-black rounded-xl text-xs"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={submitQuiz}
                  disabled={Object.keys(userAnswers).length === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-xl text-xs disabled:opacity-40"
                >
                  Submit Drill
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
