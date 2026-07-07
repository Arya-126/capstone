import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getFriendIds } from './friends';

const router = Router();
const userCard = { id: true, name: true, level: true, xpTotal: true, streakDays: true } as const;

// GET /leaderboard?scope=global|cohort|friends
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const scope = ((req.query.scope as string) || 'global').toLowerCase();
    const me = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { ...userCard, cohortId: true },
    });

    // build the scope filter
    let where: any = {};
    if (scope === 'cohort') {
      if (!me?.cohortId) {
        return res.json({ leaderboard: [], currentUser: null, scope, needsCohort: true });
      }
      where = { cohortId: me.cohortId };
    } else if (scope === 'friends') {
      const ids = await getFriendIds(req.userId!);
      where = { id: { in: [req.userId!, ...ids] } };
    }

    const topUsers = await prisma.user.findMany({
      where,
      select: userCard,
      orderBy: { xpTotal: 'desc' },
      take: 50,
    });

    const idx = topUsers.findIndex((u) => u.id === req.userId);
    let currentUser = null;
    if (idx >= 0) {
      const { cohortId, ...rest } = me as any;
      currentUser = { rank: idx + 1, ...rest };
    } else if (me) {
      // not in the top slice — compute the rank within the same scope
      const higherCount = await prisma.user.count({
        where: { ...where, xpTotal: { gt: me.xpTotal } },
      });
      const { cohortId, ...rest } = me as any;
      currentUser = { rank: higherCount + 1, ...rest };
    }

    res.json({ leaderboard: topUsers, currentUser, scope });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
