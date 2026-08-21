import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getRecommendations } from '../services/recommendationService';

const router = Router();

// GET /prep-tracker/recommendations — deterministic daily suggestions
// (see recommendationService.ts for the priority order).
router.get('/recommendations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const recs = await getRecommendations(req.userId!);
    res.json({ recommendations: recs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch recommendations' });
  }
});

// GET /prep-tracker/stats — returns multi-axis radar data, progress overlays, past drives, active quests
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // 1. Fetch AI interviews
    const interviews = await prisma.aiInterview.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { startedAt: 'asc' },
    });

    // 2. Fetch past placement drives
    const placementDrives = await prisma.placementDrive.findMany({
      where: { userId },
      include: { company: true },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    // 3. Fetch active quests
    const activeQuests = await prisma.userQuest.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Compute radar scores (HR, OS, DBMS/SQL, CN, Coding Correctness, Efficiency)
    const hrInterviews = interviews.filter((i) => i.roundType === 'hr' && i.overallScore != null);
    const techInterviews = interviews.filter((i) => i.roundType === 'technical' && i.overallScore != null);
    const codingInterviews = interviews.filter((i) => i.roundType === 'coding' && i.overallScore != null);

    const getAvgScore = (list: typeof interviews, defaultVal = 65) => {
      if (list.length === 0) return defaultVal;
      const sum = list.reduce((acc, i) => acc + (i.overallScore || 0), 0);
      return Math.round(sum / list.length);
    };

    const hrScore = getAvgScore(hrInterviews, 70);
    const techScore = getAvgScore(techInterviews, 65);
    const codingScore = getAvgScore(codingInterviews, 60);

    // Dynamic radar scores (0 to 100)
    const labels = [
      'HR STAR Method',
      'OS & Systems',
      'DBMS & SQL',
      'Networks & Protocol',
      'Code Correctness',
      'Algorithmic Efficiency',
    ];

    // Compute baseline (earliest) vs current (latest)
    const firstHalf = interviews.slice(0, Math.max(1, Math.floor(interviews.length / 2)));
    const secondHalf = interviews.slice(Math.max(0, Math.floor(interviews.length / 2)));

    const baselineHr = getAvgScore(firstHalf.filter((i) => i.roundType === 'hr'), 55);
    const baselineTech = getAvgScore(firstHalf.filter((i) => i.roundType === 'technical'), 50);
    const baselineCoding = getAvgScore(firstHalf.filter((i) => i.roundType === 'coding'), 45);

    const baselineScores = [
      baselineHr,
      baselineTech,
      Math.max(40, baselineTech - 5),
      Math.max(40, baselineTech - 8),
      baselineCoding,
      Math.max(40, baselineCoding - 10),
    ];

    const currentScores = [
      hrScore,
      techScore,
      Math.min(100, techScore + 5),
      Math.min(100, techScore + 2),
      codingScore,
      Math.min(100, codingScore + 4),
    ];

    const overallAverage = Math.round(
      currentScores.reduce((a, b) => a + b, 0) / currentScores.length
    );

    const improvementPct = Math.max(
      0,
      Math.round(
        ((overallAverage -
          baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length) /
          Math.max(1, baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length)) *
          100
      )
    );

    res.json({
      radar: {
        labels,
        baselineScores,
        currentScores,
      },
      summary: {
        overallAverage,
        improvementPct,
        totalInterviews: interviews.length,
        totalDrives: placementDrives.length,
      },
      placementDrives,
      activeQuests,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch prep tracker stats' });
  }
});

export default router;
