import { prisma } from '../lib/prisma';
import { getOrGenerateSynopsis } from './synopsisService';

// Post-attempt comprehensive report. Called from the various finish paths
// (aptitude quiz, core-CS quiz, AI interview, coding round) after scoring.
// See plan-comprehensive-reports.md Part B.
//
// Design:
// - Concept tagging is deterministic in v1 — every question already carries
//   enough metadata (topic + subject) to tag its concept. No LLM in the
//   report-generation hot path.
// - Weak concepts are surfaced with ≥ 2 misses OR miss rate > 40%.
// - Synopsis generation is fire-and-forget (Promise.all in the background);
//   the report row is written immediately with an empty synopsis map, and
//   the client resolves synopses via GET /synopses/:subject/:concept
//   (cache-first — first call warms, subsequent calls hit cache).

export type ReportSourceType =
  | 'aptitude-quiz'
  | 'core-cs-quiz'
  | 'ai-interview'
  | 'coding-round';

export interface PerQuestionRecord {
  questionId: string;
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  conceptTag: string; // e.g. "OS: Virtual Memory" or "Quantitative: Percentages"
  subject: string;    // e.g. "OS" | "Quantitative"
}

export interface WeakConcept {
  concept: string;
  subject: string;
  missCount: number;
  missedQuestionIds: string[];
}
export interface StrongConcept {
  concept: string;
  subject: string;
  correctCount: number;
}

// ---- helpers to build per-question records for each source type ----

async function aptitudeAttempt(
  userId: string,
  answers: { questionId: string; chosenIndex: number }[],
): Promise<PerQuestionRecord[]> {
  const qs = await prisma.interviewQuestion.findMany({
    where: { id: { in: answers.map((a) => a.questionId) } },
    include: { topic: { include: { category: true } } },
  });
  const byId = new Map(qs.map((q) => [q.id, q]));
  return answers.map((a) => {
    const q = byId.get(a.questionId);
    if (!q) {
      return {
        questionId: a.questionId,
        prompt: '(question not found)',
        userAnswer: '',
        correctAnswer: '',
        isCorrect: false,
        explanation: '',
        conceptTag: 'Aptitude: Unknown',
        subject: 'Aptitude',
      };
    }
    const opts = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE].filter(Boolean) as string[];
    const isCorrect = a.chosenIndex === q.correctIndex;
    // Category → subject bucket (Quant / Logical / Verbal)
    const subject = q.topic.category.name.split(' ')[0]; // "Quantitative" / "Logical" / "Verbal"
    return {
      questionId: q.id,
      prompt: q.question,
      userAnswer: opts[a.chosenIndex] ?? '(no answer)',
      correctAnswer: opts[q.correctIndex] ?? '',
      isCorrect,
      explanation: '', // InterviewQuestion has no explanation field
      conceptTag: `${subject}: ${q.topic.name}`,
      subject,
    };
  });
}

async function coreCsAttempt(
  userId: string,
  answers: { questionId: string; selectedIndex: number }[],
): Promise<PerQuestionRecord[]> {
  const qs = await prisma.coreSubjectQuestion.findMany({
    where: { id: { in: answers.map((a) => a.questionId) } },
  });
  const byId = new Map(qs.map((q) => [q.id, q]));
  return answers.map((a) => {
    const q = byId.get(a.questionId);
    if (!q) {
      return {
        questionId: a.questionId,
        prompt: '(question not found)',
        userAnswer: '',
        correctAnswer: '',
        isCorrect: false,
        explanation: '',
        conceptTag: 'CS: Unknown',
        subject: 'CS',
      };
    }
    const opts = (q.options as string[]) || [];
    const isCorrect = a.selectedIndex === q.answerIndex;
    return {
      questionId: q.id,
      prompt: q.question,
      userAnswer: opts[a.selectedIndex] ?? '(no answer)',
      correctAnswer: opts[q.answerIndex] ?? '',
      isCorrect,
      explanation: q.explanation || '',
      conceptTag: `${q.subject}: ${q.tags?.[0] || 'General'}`,
      subject: q.subject,
    };
  });
}

async function aiInterviewAttempt(interviewId: string): Promise<PerQuestionRecord[]> {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { order: 'asc' } } },
  });
  if (!interview) return [];
  const candidateTurns = interview.turns.filter((t) => t.role === 'CANDIDATE');
  // For each candidate turn, the preceding interviewer turn is the "question".
  const rows: PerQuestionRecord[] = [];
  for (const t of candidateTurns) {
    const prev = interview.turns.find((x) => x.order === t.order - 1);
    const score = t.turnScore ?? 0;
    // Convention: rubric 0-5 — treat ≥ 3 as "correct"-ish for reporting
    rows.push({
      questionId: t.id,
      prompt: prev?.content || '(unknown question)',
      userAnswer: t.content,
      correctAnswer: '(open-ended — see feedback)',
      isCorrect: score >= 3,
      explanation: t.feedback || '',
      conceptTag: `${(interview.roundType || 'technical').toUpperCase()}: Turn ${t.order}`,
      subject: (interview.roundType || 'technical') === 'hr' ? 'HR' : 'CS',
    });
  }
  return rows;
}

async function codingAttempt(interviewId: string): Promise<PerQuestionRecord[]> {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { order: 'asc' } } },
  });
  if (!interview) return [];
  const codeTurn = interview.turns.find((t) => t.role === 'CANDIDATE');
  if (!codeTurn) return [];
  const rubric = (interview.rubricScores as Record<string, number>) || {};
  // Emit one "row" per rubric axis so the report can show axis-by-axis
  return Object.entries(rubric).map(([axis, score]) => ({
    questionId: `${codeTurn.id}:${axis}`,
    prompt: `Coding round — ${axis}`,
    userAnswer: `Score: ${score}/5`,
    correctAnswer: '5/5',
    isCorrect: (score || 0) >= 3,
    explanation: '',
    conceptTag: `DSA: ${axis}`,
    subject: 'DSA',
  }));
}

// ---- weakness aggregation ----

const MISS_RATE_THRESHOLD = 0.4;
const MIN_MISSES_TO_FLAG = 2;

function aggregateConcepts(rows: PerQuestionRecord[]) {
  const byConcept = new Map<string, { concept: string; subject: string; missIds: string[]; correctCount: number; total: number }>();
  for (const r of rows) {
    const [subject, ...rest] = r.conceptTag.split(':').map((s) => s.trim());
    const concept = rest.join(':').trim() || 'General';
    const key = `${subject}::${concept}`;
    const agg = byConcept.get(key) || { concept, subject, missIds: [], correctCount: 0, total: 0 };
    agg.total++;
    if (r.isCorrect) agg.correctCount++;
    else agg.missIds.push(r.questionId);
    byConcept.set(key, agg);
  }

  const weak: WeakConcept[] = [];
  const strong: StrongConcept[] = [];
  for (const a of byConcept.values()) {
    const missRate = a.total > 0 ? (a.missIds.length / a.total) : 0;
    if (a.missIds.length >= MIN_MISSES_TO_FLAG || missRate > MISS_RATE_THRESHOLD) {
      weak.push({
        concept: a.concept,
        subject: a.subject,
        missCount: a.missIds.length,
        missedQuestionIds: a.missIds,
      });
    } else if (a.correctCount > 0) {
      strong.push({ concept: a.concept, subject: a.subject, correctCount: a.correctCount });
    }
  }
  // sort worst-first
  weak.sort((x, y) => y.missCount - x.missCount);
  return { weak, strong };
}

// ---- primary entry ----

export async function generateReport(opts: {
  userId: string;
  sourceType: ReportSourceType;
  sourceId: string;
  overallScore: number;
  // Only one of these applies per sourceType (grader supplies it):
  aptitudeAnswers?: { questionId: string; chosenIndex: number }[];
  coreCsAnswers?: { questionId: string; selectedIndex: number }[];
}): Promise<{ id: string }> {
  let rows: PerQuestionRecord[] = [];
  if (opts.sourceType === 'aptitude-quiz' && opts.aptitudeAnswers) {
    rows = await aptitudeAttempt(opts.userId, opts.aptitudeAnswers);
  } else if (opts.sourceType === 'core-cs-quiz' && opts.coreCsAnswers) {
    rows = await coreCsAttempt(opts.userId, opts.coreCsAnswers);
  } else if (opts.sourceType === 'ai-interview') {
    rows = await aiInterviewAttempt(opts.sourceId);
  } else if (opts.sourceType === 'coding-round') {
    rows = await codingAttempt(opts.sourceId);
  }

  const { weak, strong } = aggregateConcepts(rows);

  const report = await prisma.testReport.create({
    data: {
      userId: opts.userId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      overallScore: opts.overallScore,
      perQuestion: rows as any,
      weakConcepts: weak as any,
      strongConcepts: strong as any,
    },
  });

  // Warm the synopsis cache for each weak concept in the background — do NOT
  // await, so the report response returns fast. Client fetches synopses via
  // /synopses/:subject/:concept which is cache-first.
  for (const w of weak.slice(0, 6)) {
    getOrGenerateSynopsis({ subject: w.subject, concept: w.concept }).catch((e) => {
      console.warn(`Background synopsis warm failed (${w.subject}/${w.concept}):`, e?.message || e);
    });
  }

  return { id: report.id };
}

export async function getReport(userId: string, id: string) {
  const report = await prisma.testReport.findUnique({ where: { id } });
  if (!report || report.userId !== userId) return null;
  return report;
}

export async function listReports(userId: string, limit = 20) {
  return prisma.testReport.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, sourceType: true, sourceId: true, overallScore: true,
      createdAt: true, weakConcepts: true,
    },
  });
}
