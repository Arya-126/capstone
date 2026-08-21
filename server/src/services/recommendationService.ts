import { prisma } from '../lib/prisma';

// Daily recommendations for the prep tracker. Read-only aggregation — no
// writes, no LLM calls, no caching. The priority list is deliberately
// deterministic so the same user state always produces the same suggestions
// (predictable UX beats novelty here).
//
// Priority order (highest first):
//   1. Overdue active quests — deadline pressure trumps everything
//   2. Weakest area from the latest interview diagnosis — direct feedback loop
//   3. Round types the user hasn't tried yet — breadth before depth
//   4. Stale topics — nothing practiced in 7+ days (spaced repetition)
//   5. Streak nudge — user hasn't been active today
//
// Each recommendation has a stable `key` so the client can dedupe / animate
// consistently across polls.

export type RecoAction =
  | 'quest'
  | 'interview'
  | 'topic-review'
  | 'quiz'
  | 'coding'
  | 'streak';

export interface Recommendation {
  key: string;                    // stable id — same input yields same key
  priority: number;               // 1 (highest) .. 5 (lowest)
  title: string;                  // one-line CTA
  reason: string;                 // why this was suggested — human-readable
  action: RecoAction;
  target?: {                      // where to navigate on the client
    page?: string;                // e.g. 'hr-prep', 'core-cs', 'ai-interview'
    id?: string;                  // quest id, topic id, etc.
    slug?: string;
    meta?: Record<string, any>;
  };
}

const STALE_TOPIC_DAYS = 7;
const QUEST_OVERDUE_DAYS = 5;   // an ACTIVE quest older than this is nudged

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getRecommendations(userId: string): Promise<Recommendation[]> {
  const now = new Date();

  const [user, activeQuests, latestInterview, interviewsAll, staleProgress] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, streakDays: true, lastActiveAt: true },
    }),
    prisma.userQuest.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },  // oldest active first — most likely overdue
    }),
    prisma.aiInterview.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { endedAt: 'desc' },
      select: { id: true, roundType: true, endedAt: true },
    }),
    prisma.aiInterview.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { roundType: true },
    }),
    // topics from the game arcade that haven't been practiced recently
    prisma.userInterviewProgress.findMany({
      where: { userId },
      include: { topic: { include: { category: true } } },
      orderBy: { lastPlayedAt: 'asc' },
      take: 20,
    }),
  ]);

  if (!user) return [];

  const recs: Recommendation[] = [];

  // ---- 1. Overdue active quests ----
  for (const quest of activeQuests) {
    const ageDays = daysBetween(now, quest.createdAt);
    if (ageDays < QUEST_OVERDUE_DAYS) continue;
    recs.push({
      key: `quest:${quest.id}`,
      priority: 1,
      title: `Finish your quest: ${quest.title}`,
      reason: `Active for ${ageDays} days — knock out the remaining milestones to claim ${quest.xpReward} XP.`,
      action: 'quest',
      target: { page: 'quest-hub', id: quest.id },
    });
    if (recs.length >= 3) break;  // don't drown the user in overdue nags
  }

  // ---- 2. Latest interview's weakest area ----
  if (latestInterview) {
    const diagnosis = await prisma.interviewDiagnosis.findUnique({
      where: { interviewId: latestInterview.id },
    });
    const weakAreas = (diagnosis?.weakAreas as any[]) || [];
    // pick the single lowest-scoring weak area
    const weakest = weakAreas
      .filter((w) => typeof w?.score === 'number')
      .sort((a, b) => a.score - b.score)[0];
    if (weakest) {
      // The diagnosis JSON also carries topicMappings with actionUrl — prefer
      // that page when present so we deep-link to the actual review page.
      const mappings = (diagnosis?.topicMappings as any[]) || [];
      const mapped = mappings.find(
        (m) => typeof m?.topicName === 'string' &&
          m.topicName.toLowerCase().includes(String(weakest.area).toLowerCase())
      );
      recs.push({
        key: `weak:${latestInterview.id}:${weakest.area}`,
        priority: 2,
        title: `Shore up ${weakest.area}`,
        reason:
          weakest.advice ||
          `Your last interview scored ${weakest.score}/5 on ${weakest.area} — drill this before your next attempt.`,
        action: 'topic-review',
        target: {
          page: mapped?.actionUrl || 'core-cs',
          meta: { area: weakest.area, score: weakest.score },
        },
      });
    }
  }

  // ---- 3. Round types not yet attempted ----
  const attempted = new Set(interviewsAll.map((i) => i.roundType).filter(Boolean));
  const ROUND_LABELS: Record<string, { title: string; reason: string }> = {
    hr: {
      title: 'Try an HR mock interview',
      reason: 'Behavioral rounds catch most candidates off-guard — practice STAR before the real thing.',
    },
    technical: {
      title: 'Try a technical mock interview',
      reason: 'Verbal explanations of OS/DBMS/CN are graded differently from MCQs — get reps in.',
    },
    coding: {
      title: 'Try a live coding interview',
      reason: 'Coding under camera + voice is a very different skill from solo problem-solving.',
    },
  };
  for (const round of ['hr', 'technical', 'coding'] as const) {
    if (attempted.has(round)) continue;
    const meta = ROUND_LABELS[round];
    recs.push({
      key: `round:${round}`,
      priority: 3,
      title: meta.title,
      reason: meta.reason,
      action: 'interview',
      target: { page: 'ai-interview', meta: { roundType: round } },
    });
  }

  // ---- 4. Stale topics ----
  for (const p of staleProgress) {
    if (!p.lastPlayedAt) continue;
    const daysStale = daysBetween(now, p.lastPlayedAt);
    if (daysStale < STALE_TOPIC_DAYS) continue;
    recs.push({
      key: `stale:${p.topicId}`,
      priority: 4,
      title: `Revisit ${p.topic.name}`,
      reason: `${daysStale} days since your last practice — quick refresher before you lose it.`,
      action: 'quiz',
      target: {
        page: 'interview-category',
        slug: p.topic.category?.slug,
        id: p.topicId,
      },
    });
    if (recs.filter((r) => r.priority === 4).length >= 3) break;
  }

  // ---- 5. Streak nudge ----
  const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
  const inactiveToday = !lastActive || daysBetween(now, lastActive) >= 1;
  if (inactiveToday && (user.streakDays ?? 0) > 0) {
    recs.push({
      key: 'streak',
      priority: 5,
      title: `Keep your ${user.streakDays}-day streak alive`,
      reason: 'Any activity today counts — a quick quiz or theory review is enough.',
      action: 'streak',
      target: { page: 'core-cs' },
    });
  }

  // stable sort by priority then insertion order
  return recs
    .map((r, idx) => ({ ...r, _idx: idx }))
    .sort((a, b) => a.priority - b.priority || a._idx - b._idx)
    .map(({ _idx, ...r }) => r);
}
