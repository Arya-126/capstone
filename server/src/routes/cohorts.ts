import { Router, Response } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Cohorts = a college / class group. Students join with a short code; educators
// and admins create them. Drives the "My College" leaderboard scope and
// cohort-only contests.

const router = Router();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// GET /cohorts/me — the caller's cohort + member count (null if none)
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        cohort: {
          select: { id: true, name: true, slug: true, joinCode: true, _count: { select: { members: true } } },
        },
      },
    });
    if (!u?.cohort) return res.json(null);
    const { _count, ...c } = u.cohort;
    res.json({ ...c, memberCount: _count.members });
  } catch (error) {
    console.error('Cohort me error:', error);
    res.status(500).json({ error: 'Failed to load cohort' });
  }
});

// POST /cohorts/join { joinCode }
router.post('/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const code = (req.body?.joinCode || '').toString().trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'joinCode required' });
    const cohort = await prisma.cohort.findUnique({ where: { joinCode: code } });
    if (!cohort) return res.status(404).json({ error: 'Invalid join code' });
    await prisma.user.update({ where: { id: req.userId! }, data: { cohortId: cohort.id } });
    res.json({ ok: true, cohort: { id: cohort.id, name: cohort.name } });
  } catch (error) {
    console.error('Cohort join error:', error);
    res.status(500).json({ error: 'Failed to join cohort' });
  }
});

// POST /cohorts { name } — create (ADMIN/EDUCATOR)
router.post('/', authMiddleware, requireRole('ADMIN', 'EDUCATOR'), async (req: AuthRequest, res: Response) => {
  try {
    const name = (req.body?.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    let slug = slugify(name);
    if (await prisma.cohort.findUnique({ where: { slug } })) slug = `${slug}-${genCode().toLowerCase()}`;
    let joinCode = genCode();
    while (await prisma.cohort.findUnique({ where: { joinCode } })) joinCode = genCode();
    const cohort = await prisma.cohort.create({ data: { name, slug, joinCode } });
    res.json(cohort);
  } catch (error) {
    console.error('Cohort create error:', error);
    res.status(500).json({ error: 'Failed to create cohort' });
  }
});

export default router;
