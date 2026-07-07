import { prisma } from '../lib/prisma';
import { awardXp } from './xpService';

// A contest wraps an AssessmentTest with a time window. Ranking and placement
// XP live here; the attempt/grading flow is the unchanged assessment engine.

export type ContestStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export function contestStatus(c: { startsAt: Date; endsAt: Date }, now = new Date()): ContestStatus {
  if (now < c.startsAt) return 'UPCOMING';
  if (now > c.endsAt) return 'ENDED';
  return 'LIVE';
}

const PLACEMENT_XP = [200, 120, 80]; // 1st / 2nd / 3rd
const PARTICIPATION_XP = 25;

export interface RankRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  durationUsedSec: number;
  attemptId: string;
}

// Each participant's BEST attempt, ranked by score desc then speed (duration) asc.
export async function contestRanking(testId: string): Promise<RankRow[]> {
  const attempts = await prisma.testAttempt.findMany({
    where: { testId, status: { in: ['SUBMITTED', 'EXPIRED'] }, score: { not: null } },
    select: {
      id: true,
      userId: true,
      score: true,
      durationUsedSec: true,
      user: { select: { name: true } },
    },
  });
  attempts.sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.durationUsedSec - b.durationUsedSec
  );
  const seen = new Set<string>();
  const rows: RankRow[] = [];
  for (const a of attempts) {
    if (seen.has(a.userId)) continue; // keep each user's best (first after sort)
    seen.add(a.userId);
    rows.push({
      rank: rows.length + 1,
      userId: a.userId,
      name: a.user.name,
      score: a.score ?? 0,
      durationUsedSec: a.durationUsedSec,
      attemptId: a.id,
    });
  }
  return rows;
}

// Award placement + participation XP exactly once after a contest ends.
// settledAt is claimed atomically so concurrent reads don't double-award.
export async function settleContest(contestId: string): Promise<void> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.settledAt || new Date() <= contest.endsAt) return;

  const claim = await prisma.contest.updateMany({
    where: { id: contestId, settledAt: null },
    data: { settledAt: new Date() },
  });
  if (claim.count === 0) return; // another request settled it first

  const ranking = await contestRanking(contest.testId);
  for (let i = 0; i < ranking.length; i++) {
    const xp = (PLACEMENT_XP[i] ?? 0) + PARTICIPATION_XP;
    if (xp > 0) await awardXp(ranking[i].userId, xp);
  }
}
