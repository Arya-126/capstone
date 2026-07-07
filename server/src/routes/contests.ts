import { Router, Response } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { startAttempt } from '../services/assessmentService';
import { contestStatus, contestRanking, settleContest } from '../services/contestService';

const router = Router();

// contests visible to a user: open (cohortId null) or their own cohort's
async function visibilityWhere(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { cohortId: true } });
  return me?.cohortId
    ? { OR: [{ cohortId: null }, { cohortId: me.cohortId }] }
    : { cohortId: null };
}

// GET /contests — live / upcoming / past (settles ended ones lazily)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const where = await visibilityWhere(req.userId!);
    const contests = await prisma.contest.findMany({
      where,
      include: {
        test: { select: { durationMinutes: true, mode: true } },
        cohort: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    const now = new Date();
    const out = [];
    for (const c of contests) {
      const status = contestStatus(c, now);
      if (status === 'ENDED' && !c.settledAt) await settleContest(c.id);
      out.push({
        id: c.id,
        title: c.title,
        slug: c.slug,
        description: c.description,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        status,
        durationMinutes: c.test.durationMinutes,
        mode: c.test.mode,
        cohort: c.cohort?.name ?? null,
      });
    }
    res.json(out);
  } catch (error) {
    console.error('Contests list error:', error);
    res.status(500).json({ error: 'Failed to list contests' });
  }
});

// GET /contests/:slug — detail + my attempt state
router.get('/:slug', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const c = await prisma.contest.findUnique({
      where: { slug: req.params.slug },
      include: { test: { select: { id: true, title: true, durationMinutes: true, mode: true } }, cohort: { select: { name: true } } },
    });
    if (!c) return res.status(404).json({ error: 'Contest not found' });
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { cohortId: true } });
    if (c.cohortId && c.cohortId !== me?.cohortId) {
      return res.status(403).json({ error: 'This contest is for another cohort' });
    }
    const status = contestStatus(c);
    if (status === 'ENDED' && !c.settledAt) await settleContest(c.id);
    const myAttempt = await prisma.testAttempt.findFirst({
      where: { testId: c.testId, userId: req.userId! },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, score: true },
    });
    res.json({
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status,
      testId: c.testId,
      durationMinutes: c.test.durationMinutes,
      mode: c.test.mode,
      cohort: c.cohort?.name ?? null,
      myAttempt,
    });
  } catch (error) {
    console.error('Contest detail error:', error);
    res.status(500).json({ error: 'Failed to load contest' });
  }
});

// POST /contests/:slug/start — only when LIVE & cohort matches (reuses startAttempt)
router.post('/:slug/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const c = await prisma.contest.findUnique({ where: { slug: req.params.slug } });
    if (!c) return res.status(404).json({ error: 'Contest not found' });
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { cohortId: true } });
    if (c.cohortId && c.cohortId !== me?.cohortId) {
      return res.status(403).json({ error: 'This contest is for another cohort' });
    }
    if (contestStatus(c) !== 'LIVE') return res.status(400).json({ error: 'Contest is not live' });
    await startAttempt(req.userId!, c.testId); // creates/resumes the attempt
    res.json({ testId: c.testId });
  } catch (error: any) {
    console.error('Contest start error:', error);
    res.status(400).json({ error: error.message || 'Failed to start contest' });
  }
});

// GET /contests/:slug/leaderboard — ranked by score desc, then speed asc
router.get('/:slug/leaderboard', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const c = await prisma.contest.findUnique({ where: { slug: req.params.slug } });
    if (!c) return res.status(404).json({ error: 'Contest not found' });
    if (contestStatus(c) === 'ENDED' && !c.settledAt) await settleContest(c.id);
    const ranking = await contestRanking(c.testId);
    const top = ranking.slice(0, 50);
    const mine = ranking.find((r) => r.userId === req.userId) ?? null;
    res.json({ status: contestStatus(c), leaderboard: top, currentUser: mine });
  } catch (error) {
    console.error('Contest leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load contest leaderboard' });
  }
});

// POST /contests (ADMIN/EDUCATOR) — wrap an existing PUBLISHED test in a window
router.post('/', authMiddleware, requireRole('ADMIN', 'EDUCATOR'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, testId, startsAt, endsAt, cohortId, description } = req.body || {};
    if (!title || !testId || !startsAt || !endsAt) {
      return res.status(400).json({ error: 'title, testId, startsAt, endsAt are required' });
    }
    const test = await prisma.assessmentTest.findUnique({ where: { id: testId } });
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const slug =
      String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') +
      '-' +
      Math.random().toString(36).slice(2, 6);
    const contest = await prisma.contest.create({
      data: {
        title,
        slug,
        description: description ?? null,
        testId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        cohortId: cohortId ?? null,
      },
    });
    res.json(contest);
  } catch (error: any) {
    console.error('Contest create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create contest' });
  }
});

export default router;
