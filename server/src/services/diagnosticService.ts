import { prisma } from '../lib/prisma';
import { createPipeline } from './pipelineService';
import { checkAchievements } from './achievementService';

// First-login diagnostic. Picks 25 mixed items from already-seeded banks,
// grades a submission, and computes per-pillar levels (1-5) + an overall
// belt (Bronze → Diamond) written into UserSkillProfile.
//
// Design notes (see plan.md "Plan Addendum: Personalized Learning Pipeline"):
// - Deterministic scoring, no LLM in the hot path.
// - Adaptive difficulty is intentionally simple: within an aptitude/coreCS
//   block, flip target difficulty based on running accuracy after every 3
//   answered items. We approximate this at grade time by treating harder
//   items as worth more.
// - Coding contributes as `passedTests / totalTests`; timeout counts as 0.

// ---- item selection ----

export type DiagnosticItemKind = 'aptitude-mcq' | 'coreCS-mcq' | 'coding';

export interface DiagnosticItem {
  qId: string;
  kind: DiagnosticItemKind;
  pillar: 'aptitude' | 'coreCS' | 'coding';
  subtopic: string;              // "Quant" | "CN" | "Arrays" etc — used in breakdown
  difficulty: 'easy' | 'medium' | 'hard';
  timeBudgetMs: number;          // 60_000 for MCQ, 900_000 (15 min) for coding
  expectedIndex?: number;        // MCQ: 0-indexed correct answer (frozen at start)
  // Display fields — shipped to the client so it can render without re-fetching
  prompt: string;                // question text or problem title
  options?: string[];            // MCQ options in display order (index-aligned)
  problemSlug?: string;          // coding: slug for deep-link into ProblemSolver
}

interface FrozenSnapshot {
  items: DiagnosticItem[];
  createdAt: string;
}

// Balances the 25-item mix: 6 aptitude + 8 core CS + 1 coding + 10 adaptive
// follow-ups (picked as extra medium items across all three pillars, grader
// weights them the same as the base items — the "adaptive" story is really
// about difficulty on retake).
const TARGET_COUNTS = {
  aptitude: 8,   // 6 base + 2 adaptive
  coreCS: 12,    // 8 base + 4 adaptive (2 CN, 1 OS, 1 DBMS)
  coding: 1,
};

// pick N random rows without replacement — Fisher-Yates, seedless (fine for
// a diagnostic; retaking is expected to give a fresh mix)
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

export async function buildDiagnosticItems(): Promise<DiagnosticItem[]> {
  // --- Aptitude (from InterviewQuestion via InterviewTopic → category) ---
  // We take a spread across the 3 categories: Quant, Logical, Verbal.
  const aptTopics = await prisma.interviewTopic.findMany({
    include: { category: true },
  });
  const bySection: Record<string, typeof aptTopics> = { A: [], B: [], C: [] };
  for (const t of aptTopics) {
    const s = t.category.section;
    if (bySection[s]) bySection[s].push(t);
  }
  const aptItems: DiagnosticItem[] = [];
  for (const section of ['A', 'B', 'C'] as const) {
    // pick 2-3 topics per section, then 1 question per topic
    const topicPool = sample(bySection[section], 3);
    for (const topic of topicPool) {
      const q = await prisma.interviewQuestion.findFirst({
        where: { topicId: topic.id, difficulty: 'medium', isValid: true },
        orderBy: { id: 'asc' },
      });
      if (q) {
        const options = [q.optionA, q.optionB, q.optionC, q.optionD, q.optionE].filter(
          (o): o is string => typeof o === 'string' && o.length > 0,
        );
        aptItems.push({
          qId: `apt:${q.id}`,
          kind: 'aptitude-mcq',
          pillar: 'aptitude',
          subtopic: topic.category.name.split(' ')[0], // Quant / Logical / Verbal
          difficulty: (q.difficulty as any) || 'medium',
          timeBudgetMs: 60_000,
          expectedIndex: q.correctIndex,
          prompt: q.question,
          options,
        });
      }
      if (aptItems.length >= TARGET_COUNTS.aptitude) break;
    }
    if (aptItems.length >= TARGET_COUNTS.aptitude) break;
  }

  // --- Core CS (2-3 per subject: CN, OS, DBMS, SQL) ---
  const csItems: DiagnosticItem[] = [];
  const csPerSubject: Record<string, number> = { CN: 3, OS: 3, DBMS: 3, SQL: 3 };
  for (const [subject, n] of Object.entries(csPerSubject)) {
    const pool = await prisma.coreSubjectQuestion.findMany({ where: { subject }, take: 40 });
    for (const q of sample(pool, n)) {
      csItems.push({
        qId: `cs:${q.id}`,
        kind: 'coreCS-mcq',
        pillar: 'coreCS',
        subtopic: subject,
        difficulty: (q.difficulty as any) || 'medium',
        timeBudgetMs: 60_000,
        expectedIndex: q.answerIndex,
        prompt: q.question,
        options: q.options as string[],
      });
    }
  }

  // --- Coding (1 EASY problem; ProblemSolver embeds in a modal on the client) ---
  const codingItems: DiagnosticItem[] = [];
  const easy = await prisma.codingProblem.findFirst({
    where: { difficulty: 'EASY', verified: true },
    orderBy: { createdAt: 'asc' },
  });
  const codingChoice = easy ?? (await prisma.codingProblem.findFirst({
    where: { difficulty: 'EASY' },
    orderBy: { createdAt: 'asc' },
  }));
  if (codingChoice) {
    codingItems.push({
      qId: `code:${codingChoice.id}`,
      kind: 'coding',
      pillar: 'coding',
      subtopic: 'DSA',
      difficulty: 'easy',
      timeBudgetMs: 15 * 60 * 1000,
      // no expectedIndex — grading uses passed/total from /code/submit
      prompt: codingChoice.title,
      problemSlug: codingChoice.slug,
    });
  }

  // stable order: aptitude first (warmup), then core CS, coding last (harder)
  return [...aptItems, ...csItems, ...codingItems];
}

// ---- attempt lifecycle ----

export async function startDiagnostic(userId: string) {
  // block a duplicate active attempt — we allow retakes but not two open at once
  const existing = await prisma.diagnosticAttempt.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) {
    return {
      attemptId: existing.id,
      items: sanitizeForClient((existing.itemsSnapshot as any as FrozenSnapshot).items),
      resumed: true,
    };
  }

  const items = await buildDiagnosticItems();
  const snapshot: FrozenSnapshot = { items, createdAt: new Date().toISOString() };
  const attempt = await prisma.diagnosticAttempt.create({
    data: {
      userId,
      status: 'IN_PROGRESS',
      itemsSnapshot: snapshot as any,
    },
  });

  return { attemptId: attempt.id, items: sanitizeForClient(items), resumed: false };
}

// Strip expected answers before shipping to the client — never let the
// browser see the correct index of an ungraded MCQ.
function sanitizeForClient(items: DiagnosticItem[]) {
  return items.map(({ expectedIndex: _e, ...rest }) => rest);
}

// ---- grading ----

// Response payload from the client per item:
//   MCQ: { qId, chosenIndex, timeMs }
//   coding: { qId, passed, total, timeMs }
export interface DiagnosticResponse {
  qId: string;
  chosenIndex?: number;
  passed?: number;
  total?: number;
  timeMs?: number;
}

const LEVEL_LABELS = ['', 'Foundations', 'Novice', 'Intermediate', 'Proficient', 'Advanced'];
const BELT_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

// score → level 1-5 per plan (0.30/0.50/0.70/0.85 cutoffs)
function scoreToLevel(score: number): number {
  if (score < 0.30) return 1;
  if (score < 0.50) return 2;
  if (score < 0.70) return 3;
  if (score < 0.85) return 4;
  return 5;
}

function levelsToBelt(levels: number[]): string {
  const diagnosed = levels.filter((v) => v > 0);
  if (diagnosed.length === 0) return 'Unranked';
  const avg = diagnosed.reduce((s, v) => s + v, 0) / diagnosed.length;
  if (avg <= 1.5) return 'Bronze';
  if (avg <= 2.5) return 'Silver';
  if (avg <= 3.5) return 'Gold';
  if (avg <= 4.5) return 'Platinum';
  return 'Diamond';
}

// Difficulty multiplier — a correct HARD answer is worth 1.3× a MEDIUM;
// EASY is 0.8×. Mirrors the same weighting weaknessDetector.ts uses.
const DIFF_WEIGHT: Record<string, number> = { easy: 0.8, medium: 1.0, hard: 1.3 };

interface PillarAgg {
  weightedCorrect: number;
  weightedTotal: number;
  attempted: number;
  totalTimeMs: number;
  totalBudgetMs: number;
  perSubtopic: Record<string, { correct: number; total: number }>;
}

function emptyPillar(): PillarAgg {
  return {
    weightedCorrect: 0,
    weightedTotal: 0,
    attempted: 0,
    totalTimeMs: 0,
    totalBudgetMs: 0,
    perSubtopic: {},
  };
}

export async function submitDiagnostic(
  userId: string,
  attemptId: string,
  responses: DiagnosticResponse[],
) {
  const attempt = await prisma.diagnosticAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw new Error('Diagnostic not found');
  if (attempt.status !== 'IN_PROGRESS') throw new Error('Diagnostic already submitted');

  const snapshot = attempt.itemsSnapshot as any as FrozenSnapshot;
  const itemsById = new Map(snapshot.items.map((i) => [i.qId, i]));
  const responseById = new Map(responses.map((r) => [r.qId, r]));

  const pillars: Record<'aptitude' | 'coreCS' | 'coding', PillarAgg> = {
    aptitude: emptyPillar(),
    coreCS: emptyPillar(),
    coding: emptyPillar(),
  };

  const graded: Record<string, { correct: boolean; timeMs: number; score01: number }> = {};

  for (const item of snapshot.items) {
    const resp = responseById.get(item.qId);
    const w = DIFF_WEIGHT[item.difficulty] ?? 1.0;
    const p = pillars[item.pillar];
    p.weightedTotal += w;
    p.totalBudgetMs += item.timeBudgetMs;
    const sub = (p.perSubtopic[item.subtopic] ||= { correct: 0, total: 0 });
    sub.total += 1;

    let score01 = 0;
    let correct = false;
    const timeMs = Math.max(0, Math.min(item.timeBudgetMs, resp?.timeMs ?? item.timeBudgetMs));

    if (!resp) {
      // unanswered — 0 credit, count full budget as spent (represents timeout)
      p.totalTimeMs += item.timeBudgetMs;
    } else if (item.kind === 'coding') {
      // partial credit from passed/total
      const total = Math.max(0, resp.total ?? 0);
      const passed = Math.max(0, Math.min(total, resp.passed ?? 0));
      score01 = total > 0 ? passed / total : 0;
      correct = total > 0 && passed === total;
      p.weightedCorrect += w * score01;
      p.attempted += 1;
      p.totalTimeMs += timeMs;
      if (correct) sub.correct += 1;
    } else {
      // MCQ — binary correctness
      const chosen = resp.chosenIndex;
      correct = typeof chosen === 'number' && chosen === item.expectedIndex;
      score01 = correct ? 1 : 0;
      if (correct) {
        p.weightedCorrect += w;
        sub.correct += 1;
      }
      p.attempted += 1;
      p.totalTimeMs += timeMs;
    }

    graded[item.qId] = { correct, timeMs, score01 };
  }

  // per-pillar final score: 75% accuracy + 25% speed
  const perPillarScores: Record<string, number> = {};
  const levelsAwarded: Record<string, number> = {};

  for (const pillar of ['aptitude', 'coreCS', 'coding'] as const) {
    const p = pillars[pillar];
    if (p.weightedTotal === 0) {
      perPillarScores[pillar] = 0;
      levelsAwarded[pillar] = 0; // undiagnosed
      continue;
    }
    const accuracy = p.weightedCorrect / p.weightedTotal;
    // speed component: 0 if you used the full budget, 1 if you used none.
    // For unanswered items we counted the full budget, so timeouts also drag
    // speed down — deliberate; speed correlates with mastery.
    const speed = p.totalBudgetMs > 0 ? 1 - Math.min(1, p.totalTimeMs / p.totalBudgetMs) : 0;
    const score = 0.75 * accuracy + 0.25 * speed;
    perPillarScores[pillar] = Math.round(score * 1000) / 1000;
    levelsAwarded[pillar] = scoreToLevel(score);
  }

  // per-subtopic breakdown for the profile (used later by pipeline generator)
  const breakdown: Record<string, number> = {};
  for (const pillar of ['aptitude', 'coreCS', 'coding'] as const) {
    for (const [sub, { correct, total }] of Object.entries(pillars[pillar].perSubtopic)) {
      const acc = total > 0 ? correct / total : 0;
      breakdown[sub] = scoreToLevel(acc);
    }
  }

  const overallBelt = levelsToBelt([
    levelsAwarded.aptitude,
    levelsAwarded.coreCS,
    levelsAwarded.coding,
  ]);

  // persist: attempt + profile in a single transaction
  await prisma.$transaction([
    prisma.diagnosticAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        responses: graded as any,
        perPillarScores: perPillarScores as any,
        levelsAwarded: levelsAwarded as any,
      },
    }),
    prisma.userSkillProfile.upsert({
      where: { userId },
      create: {
        userId,
        aptitudeLevel: levelsAwarded.aptitude,
        coreCSLevel: levelsAwarded.coreCS,
        codingLevel: levelsAwarded.coding,
        overallBelt,
        breakdown: breakdown as any,
        diagnosticAt: new Date(),
        lastRefreshAt: new Date(),
      },
      update: {
        aptitudeLevel: levelsAwarded.aptitude,
        coreCSLevel: levelsAwarded.coreCS,
        codingLevel: levelsAwarded.coding,
        overallBelt,
        breakdown: breakdown as any,
        diagnosticAt: new Date(),
        lastRefreshAt: new Date(),
      },
    }),
  ]);

  // Fire achievement events for the new diagnostic + belt. Wrapped so bugs in
  // the achievement layer can never block the diagnostic result from returning.
  try {
    await checkAchievements({
      userId,
      type: 'diagnostic_completed',
      data: { belt: overallBelt, levels: levelsAwarded },
    });
  } catch (e) {
    console.warn('Diagnostic achievement check failed (non-fatal):', e);
  }

  // Auto-generate a balanced pipeline so the user has an actionable path
  // waiting for them on the result screen. Wrapped — a pipeline-gen failure
  // must never block the diagnostic result from being returned.
  let pipelineId: string | null = null;
  try {
    pipelineId = await createPipeline(userId, { focus: 'balanced' });
  } catch (e) {
    console.warn('Auto-pipeline generation failed (non-fatal):', e);
  }

  return {
    attemptId,
    perPillarScores,
    levelsAwarded,
    breakdown,
    overallBelt,
    pipelineId,
    labels: {
      aptitude: LEVEL_LABELS[levelsAwarded.aptitude] || 'Undiagnosed',
      coreCS: LEVEL_LABELS[levelsAwarded.coreCS] || 'Undiagnosed',
      coding: LEVEL_LABELS[levelsAwarded.coding] || 'Undiagnosed',
    },
  };
}

// ---- read helpers ----

export async function getSkillProfile(userId: string) {
  return prisma.userSkillProfile.findUnique({ where: { userId } });
}
