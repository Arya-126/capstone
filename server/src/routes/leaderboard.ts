import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getFriendIds } from './friends';

const router = Router();
const userCard = { id: true, name: true, level: true, xpTotal: true, streakDays: true } as const;

type LeaderboardRow = {
  id: string;
  name: string;
  level: number;
  xpTotal: number;
  streakDays: number;
  metricValue: number;
};

// Builds userId → metric value for the scoped users.
// coding   = count of SOLVED UserProblemStatus rows
// aptitude = average of the user's best TestAttempt.score per test (graded only)
async function buildMetricValues(metric: string, whereUser: any): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  if (metric === 'coding') {
    const grouped = await prisma.userProblemStatus.groupBy({
      by: ['userId'],
      where: { status: 'SOLVED', user: whereUser },
      _count: { _all: true },
    });
    for (const g of grouped) values.set(g.userId, g._count._all);
  } else {
    // aptitude — best score per (user, test), then average per user
    const grouped = await prisma.testAttempt.groupBy({
      by: ['userId', 'testId'],
      where: { score: { not: null }, user: whereUser },
      _max: { score: true },
    });
    const sums = new Map<string, { total: number; tests: number }>();
    for (const g of grouped) {
      const s = sums.get(g.userId) || { total: 0, tests: 0 };
      s.total += g._max.score ?? 0;
      s.tests += 1;
      sums.set(g.userId, s);
    }
    sums.forEach((s, userId) => {
      values.set(userId, Math.round((s.total / s.tests) * 10) / 10);
    });
  }
  return values;
}

// GET /leaderboard?scope=global|cohort|friends&metric=xp|coding|aptitude
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const scope = ((req.query.scope as string) || 'global').toLowerCase();
    const rawMetric = ((req.query.metric as string) || 'xp').toLowerCase();
    const metric = ['xp', 'coding', 'aptitude'].includes(rawMetric) ? rawMetric : 'xp';

    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { ...userCard, cohortId: true },
    });

    // build the scope filter
    let where: any = {};
    if (scope === 'cohort') {
      if (!me?.cohortId) {
        return res.json({ leaderboard: [], currentUser: null, scope, metric, needsCohort: true });
      }
      where = { cohortId: me.cohortId };
    } else if (scope === 'friends') {
      const ids = await getFriendIds(req.userId!);
      where = { id: { in: [req.userId!, ...ids] } };
    }

    const meCard = me ? { id: me.id, name: me.name, level: me.level, xpTotal: me.xpTotal, streakDays: me.streakDays } : null;

    // ===== XP metric (original behavior) =====
    if (metric === 'xp') {
      const topUsers = await prisma.user.findMany({
        where,
        select: userCard,
        orderBy: { xpTotal: 'desc' },
        take: 50,
      });
      const rows: LeaderboardRow[] = topUsers.map((u) => ({ ...u, metricValue: u.xpTotal }));

      const idx = rows.findIndex((u) => u.id === req.userId);
      let currentUser = null;
      if (idx >= 0 && meCard) {
        currentUser = { rank: idx + 1, ...meCard, metricValue: meCard.xpTotal };
      } else if (meCard) {
        // not in the top slice — compute the rank within the same scope
        const higherCount = await prisma.user.count({
          where: { ...where, xpTotal: { gt: meCard.xpTotal } },
        });
        currentUser = { rank: higherCount + 1, ...meCard, metricValue: meCard.xpTotal };
      }

      return res.json({ leaderboard: rows, currentUser, scope, metric });
    }

    // ===== coding / aptitude metrics =====
    const values = await buildMetricValues(metric, where);
    const rankedIds = [...values.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([id]) => id);

    const rankedUsers = await prisma.user.findMany({
      where: { id: { in: rankedIds } },
      select: userCard,
    });
    const byId = new Map(rankedUsers.map((u) => [u.id, u]));
    const rows: LeaderboardRow[] = [];
    for (const id of rankedIds) {
      const u = byId.get(id);
      if (u) rows.push({ ...u, metricValue: values.get(id) ?? 0 });
    }

    // pad with scoped users who have no metric value yet — they rank last with 0
    if (rows.length < 50) {
      const pad = await prisma.user.findMany({
        where: { AND: [where, { id: { notIn: rankedIds } }] },
        select: userCard,
        orderBy: { xpTotal: 'desc' },
        take: 50 - rows.length,
      });
      for (const u of pad) rows.push({ ...u, metricValue: 0 });
    }

    const idx = rows.findIndex((u) => u.id === req.userId);
    let currentUser = null;
    if (meCard) {
      const myValue = values.get(meCard.id) ?? 0;
      if (idx >= 0) {
        currentUser = { rank: idx + 1, ...meCard, metricValue: myValue };
      } else {
        const higherCount = [...values.values()].filter((v) => v > myValue).length;
        currentUser = { rank: higherCount + 1, ...meCard, metricValue: myValue };
      }
    }

    res.json({ leaderboard: rows, currentUser, scope, metric });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /leaderboard/sidebar — compact stats for the right-hand sidebar
router.get('/sidebar', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, xpTotal: true, level: true, streakDays: true },
    });
    if (!me) return res.status(404).json({ error: 'User not found' });

    const [higherCount, codingSolved, codingTotal, weak, top5] = await Promise.all([
      prisma.user.count({ where: { xpTotal: { gt: me.xpTotal } } }),
      prisma.userProblemStatus.count({ where: { userId: me.id, status: 'SOLVED' } }),
      prisma.codingProblem.count({ where: { verified: true } }),
      prisma.masteryScore.findMany({
        where: { userId: me.id, isWeak: true },
        orderBy: { score: 'asc' },
        take: 3,
        select: { score: true, topic: { select: { subtopic: true } } },
      }),
      prisma.user.findMany({
        orderBy: { xpTotal: 'desc' },
        take: 5,
        select: { id: true, name: true, xpTotal: true },
      }),
    ]);

    res.json({
      xpTotal: me.xpTotal,
      level: me.level,
      streakDays: me.streakDays,
      rank: higherCount + 1,
      codingSolved,
      codingTotal,
      weakTopics: weak.map((w) => ({ name: w.topic.subtopic, score: Math.round(w.score) })),
      miniLeaderboard: top5.map((u) => ({ name: u.name, xpTotal: u.xpTotal, isMe: u.id === me.id })),
    });
  } catch (error) {
    console.error('Sidebar stats error:', error);
    res.status(500).json({ error: 'Failed to fetch sidebar stats' });
  }
});

export default router;
