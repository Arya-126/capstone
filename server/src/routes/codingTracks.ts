import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Coding tracks = the structured DSA practice ladder. Verified coding problems
// are grouped into tracks (problem.track ?? its topic.slug) and levels; the
// caller's per-problem status comes from UserProblemStatus rows written by
// /code/submit (no row = UNATTEMPTED).

const router = Router();

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

const percent = (solved: number, total: number) =>
  total === 0 ? 0 : Math.round((solved / total) * 100);

const DIFFICULTY_ORDER: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

async function loadTrackData(userId: string) {
  const [problems, statuses] = await Promise.all([
    prisma.codingProblem.findMany({
      where: { verified: true },
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        track: true,
        level: true,
        topic: { select: { slug: true } },
      },
    }),
    prisma.userProblemStatus.findMany({
      where: { userId },
      select: { problemId: true, status: true, bestScore: true },
    }),
  ]);
  const statusMap = new Map(statuses.map((s) => [s.problemId, s]));
  return { problems, statusMap };
}

// GET /coding-tracks — full track map: tracks → levels → problems with the caller's status
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { problems, statusMap } = await loadTrackData(req.userId!);

    // Group: track slug → level → problems
    const byTrack = new Map<string, Map<number, typeof problems>>();
    for (const p of problems) {
      const trackSlug = p.track ?? p.topic.slug;
      let levelMap = byTrack.get(trackSlug);
      if (!levelMap) {
        levelMap = new Map();
        byTrack.set(trackSlug, levelMap);
      }
      const arr = levelMap.get(p.level);
      if (arr) arr.push(p);
      else levelMap.set(p.level, [p]);
    }

    const tracks = [...byTrack.entries()]
      .map(([trackSlug, levelMap]) => {
        const levels = [...levelMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([level, probs]) => {
            const problemsOut = probs
              .slice()
              .sort(
                (a, b) =>
                  (DIFFICULTY_ORDER[a.difficulty] ?? 99) - (DIFFICULTY_ORDER[b.difficulty] ?? 99) ||
                  a.title.localeCompare(b.title),
              )
              .map((p) => {
                const st = statusMap.get(p.id);
                return {
                  id: p.id,
                  slug: p.slug,
                  title: p.title,
                  difficulty: p.difficulty,
                  status: st ? st.status : 'UNATTEMPTED',
                  bestScore: st ? st.bestScore : 0,
                };
              });
            const solved = problemsOut.filter((p) => p.status === 'SOLVED').length;
            return {
              level,
              solved,
              total: problemsOut.length,
              complete: problemsOut.length > 0 && solved === problemsOut.length,
              problems: problemsOut,
            };
          });
        const total = levels.reduce((sum, l) => sum + l.total, 0);
        const solved = levels.reduce((sum, l) => sum + l.solved, 0);
        return {
          track: trackSlug,
          name: titleCase(trackSlug),
          solved,
          total,
          percent: percent(solved, total),
          levels,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = problems.length;
    const solved = problems.filter((p) => statusMap.get(p.id)?.status === 'SOLVED').length;
    res.json({ tracks, overall: { solved, total, percent: percent(solved, total) } });
  } catch (error) {
    console.error('Coding tracks error:', error);
    res.status(500).json({ error: 'Failed to load coding tracks' });
  }
});

// GET /coding-tracks/summary — compact progress rollup for dashboards
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { problems, statusMap } = await loadTrackData(req.userId!);

    let solved = 0;
    let attempted = 0;
    const trackAgg = new Map<string, { solved: number; total: number }>();
    for (const p of problems) {
      const st = statusMap.get(p.id);
      if (st?.status === 'SOLVED') solved++;
      else if (st?.status === 'ATTEMPTED') attempted++;

      const trackSlug = p.track ?? p.topic.slug;
      const agg = trackAgg.get(trackSlug) ?? { solved: 0, total: 0 };
      agg.total++;
      if (st?.status === 'SOLVED') agg.solved++;
      trackAgg.set(trackSlug, agg);
    }

    const byTrack = [...trackAgg.entries()]
      .map(([track, a]) => ({
        track,
        name: titleCase(track),
        solved: a.solved,
        total: a.total,
        percent: percent(a.solved, a.total),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      solved,
      attempted,
      total: problems.length,
      percent: percent(solved, problems.length),
      byTrack,
    });
  } catch (error) {
    console.error('Coding tracks summary error:', error);
    res.status(500).json({ error: 'Failed to load coding tracks summary' });
  }
});

export default router;
