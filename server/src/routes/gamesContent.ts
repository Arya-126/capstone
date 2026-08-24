import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { randomStarRoleplay } from '../services/starRoleplayService';
import { randomBugHunt, randomDryRun } from '../services/codingGamesService';

const router = Router();

// GET /games-content/star-roleplay/random
router.get('/star-roleplay/random', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const puzzle = await randomStarRoleplay();
    res.json(puzzle);
  } catch (error: any) {
    console.error('STAR roleplay error:', error);
    res.status(500).json({ error: error.message || 'Failed to load STAR roleplay' });
  }
});

// GET /games-content/time-rush/random?topicSlug=optional
// Returns flashcards drawn from InterviewTheory.keyPoints of one topic.
// If no topicSlug, picks a random topic that has at least 4 key points.
router.get('/time-rush/random', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const wantSlug = (req.query.topicSlug as string | undefined)?.trim();

    let theory;
    if (wantSlug) {
      theory = await prisma.interviewTheory.findFirst({
        where: { topic: { slug: wantSlug } },
        include: { topic: { include: { category: true } } },
      });
    }
    if (!theory) {
      // random pick — filter to topics with enough content
      const candidates = await prisma.interviewTheory.findMany({
        include: { topic: { include: { category: true } } },
      });
      const usable = candidates.filter((t) => {
        const kp = (t.keyPoints as unknown as string[]) || [];
        return Array.isArray(kp) && kp.length >= 4;
      });
      if (usable.length === 0) {
        return res.status(404).json({ error: 'No theory topics with enough key points' });
      }
      theory = usable[Math.floor(Math.random() * usable.length)];
    }

    const keyPoints = ((theory.keyPoints as unknown as string[]) || [])
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 20);

    // Cards: split each key point into a "term" (first phrase before ":") and a
    // "definition" (the rest). For points without a colon, treat the whole thing
    // as a "fact" to memorize.
    const cards = keyPoints.map((kp, idx) => {
      const idxColon = kp.indexOf(':');
      if (idxColon > 3 && idxColon < 40) {
        return {
          id: `${theory!.id}:${idx}`,
          kind: 'term-def',
          prompt: kp.slice(0, idxColon).trim(),        // shown as "What does X mean?"
          answer: kp.slice(idxColon + 1).trim(),
        };
      }
      return { id: `${theory!.id}:${idx}`, kind: 'fact', prompt: kp, answer: null };
    });

    res.json({
      topicId: theory.topicId,
      topicName: theory.topic.name,
      categoryName: theory.topic.category.name,
      durationSec: 60,
      cards,
    });
  } catch (error: any) {
    console.error('Time rush error:', error);
    res.status(500).json({ error: error.message || 'Failed to load time rush' });
  }
});

// GET /games-content/bug-hunt/random — cache-first; on-demand generation
// falls back to a random verified CodingProblem if cache is empty.
router.get('/bug-hunt/random', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await randomBugHunt());
  } catch (error: any) {
    console.error('Bug Hunt error:', error);
    res.status(500).json({ error: error.message || 'Failed to load Bug Hunt' });
  }
});

// GET /games-content/dry-run/random
router.get('/dry-run/random', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await randomDryRun());
  } catch (error: any) {
    console.error('Dry-Run error:', error);
    res.status(500).json({ error: error.message || 'Failed to load Dry-Run' });
  }
});

export default router;
