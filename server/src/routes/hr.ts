import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// HR & Behavioral question bank. Read-only endpoints over the HrQuestion table
// (seeded by scripts/seed-hr.ts). Supports filtering by category and by company
// tag so the client can show e.g. only Amazon-style leadership questions.

const router = Router();

// GET /hr/categories — [{ category, count }] ordered by first appearance (sortOrder)
router.get('/categories', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.hrQuestion.groupBy({
      by: ['category'],
      _count: { category: true },
      _min: { sortOrder: true },
    });
    groups.sort((a, b) => (a._min.sortOrder ?? 0) - (b._min.sortOrder ?? 0));
    res.json(groups.map((g) => ({ category: g.category, count: g._count.category })));
  } catch (error) {
    console.error('HR categories error:', error);
    res.status(500).json({ error: 'Failed to load HR categories' });
  }
});

// GET /hr?category=&company= — questions ordered by sortOrder.
// category = exact match; company = companyTags contains the slug.
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const category = (req.query.category || '').toString().trim();
    const company = (req.query.company || '').toString().trim();

    const where: { category?: string; companyTags?: { has: string } } = {};
    if (category) where.category = category;
    if (company) where.companyTags = { has: company };

    const questions = await prisma.hrQuestion.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
    res.json(questions);
  } catch (error) {
    console.error('HR list error:', error);
    res.status(500).json({ error: 'Failed to load HR questions' });
  }
});

export default router;
