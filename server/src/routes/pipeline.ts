import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createPipeline, getCurrentPipeline } from '../services/pipelineService';

const router = Router();

// GET /pipeline/current — active pipeline for the user (or null)
router.get('/current', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pipeline = await getCurrentPipeline(req.userId!);
    res.json(pipeline);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load pipeline' });
  }
});

// POST /pipeline/create — generate a new pipeline (pauses any active one)
// body: { focus?: "balanced" | "placement-6w" | "coding-only", targetCompany?: string }
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const focus = (req.body?.focus as any) || 'balanced';
    if (!['balanced', 'placement-6w', 'coding-only'].includes(focus)) {
      return res.status(400).json({ error: 'Invalid focus preset' });
    }
    const pipelineId = await createPipeline(req.userId!, {
      focus,
      targetCompany: req.body?.targetCompany || null,
    });
    const pipeline = await getCurrentPipeline(req.userId!);
    res.json({ pipelineId, pipeline });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create pipeline' });
  }
});

// POST /pipeline/:id/skip-stage/:stageId — non-linear escape hatch. Marks
// the stage as SKIPPED (missed, not completed) so the user can come back
// and complete it later. Unlocks the next stage so they aren't stuck.
router.post('/:id/skip-stage/:stageId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id, stageId } = req.params;
    const pipeline = await prisma.learningPipeline.findUnique({
      where: { id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline || pipeline.userId !== req.userId) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    const stage = pipeline.stages.find((s) => s.id === stageId);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    if (stage.isCompleted) return res.json({ ok: true, alreadyDone: true });

    const next = pipeline.stages.find((s) => s.order === stage.order + 1);
    await prisma.$transaction([
      prisma.pipelineStage.update({
        where: { id: stage.id },
        // NOT isCompleted — this is a miss, they need to come back to it
        data: { isSkipped: true, skippedAt: new Date() },
      }),
      ...(next && !next.isUnlocked
        ? [
            prisma.pipelineStage.update({
              where: { id: next.id },
              data: { isUnlocked: true },
            }),
          ]
        : []),
    ]);
    res.json({ ok: true, skipped: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to skip stage' });
  }
});

export default router;
