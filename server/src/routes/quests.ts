import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { awardXp } from '../services/xpService';
import { checkAchievements } from '../services/achievementService';

const router = Router();

// GET /quests/active — list active learning quests
router.get('/active', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const quests = await prisma.userQuest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ quests });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch quests' });
  }
});

// POST /quests/:id/milestone/:step — toggle milestone completed
router.post('/:id/milestone/:step', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const questId = req.params.id;
    const stepNum = parseInt(req.params.step, 10);

    const quest = await prisma.userQuest.findUnique({
      where: { id: questId },
    });

    if (!quest || quest.userId !== userId) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    const milestones = (quest.milestones as any[]) || [];
    let updatedMilestones = milestones.map((m) => {
      if (m.step === stepNum) {
        return { ...m, completed: !m.completed };
      }
      return m;
    });

    const allCompleted = updatedMilestones.length > 0 && updatedMilestones.every((m) => m.completed);
    const newStatus = allCompleted ? 'COMPLETED' : 'ACTIVE';
    const justCompleted = allCompleted && quest.status !== 'COMPLETED';

    const updated = await prisma.userQuest.update({
      where: { id: questId },
      data: {
        milestones: updatedMilestones as any,
        status: newStatus,
      },
    });

    // XP + achievements on quest completion — awardXp routes through the
    // level-up check, unlike the raw xpTotal increment we had before, so a
    // quest reward that crosses a level threshold now actually levels the
    // user up.
    if (justCompleted && quest.xpReward > 0) {
      try {
        await awardXp(userId, quest.xpReward);
        await checkAchievements({
          userId,
          type: 'quest_completed',
          data: { questId: quest.id, category: quest.category, xpReward: quest.xpReward },
        });
      } catch (err) {
        console.warn('Quest completion XP/achievement failed (non-fatal):', err);
      }
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update milestone' });
  }
});

export default router;
