import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  startAttempt,
  getAttemptPayload,
  saveResponse,
  gradeAttempt,
  getAttemptReview,
  recordConsent,
  createWeakTopicPractice,
} from '../services/assessmentService';

const router = Router();
const adminOnly = [authMiddleware, requireRole('ADMIN', 'EDUCATOR')];

const PROCTORING_EVENT_TYPES = new Set([
  'TAB_BLUR', 'TAB_FOCUS', 'FULLSCREEN_EXIT', 'COPY', 'PASTE',
  'FACE_NOT_DETECTED', 'MULTIPLE_FACES', 'NO_CAMERA', 'SNAPSHOT',
]);
export const SNAPSHOT_DIR = path.join(__dirname, '..', '..', 'uploads', 'proctoring');

async function ownedOpenAttempt(attemptId: string, userId: string) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) return null;
  return attempt;
}

// ===== Admin: test builder =====

// POST /assessments  { title, description?, durationMinutes, mode, randomizeOrder,
//                      negativeMarking, passScore?, sections: [{title, kind, selectionRule?, marksPerQuestion, order}] }
router.post('/', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, durationMinutes, mode, randomizeOrder, negativeMarking, passScore, sections } = req.body;
    if (!title || !durationMinutes || !Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'title, durationMinutes and at least one section are required' });
    }
    const test = await prisma.assessmentTest.create({
      data: {
        title,
        description: description || null,
        durationMinutes: parseInt(durationMinutes, 10),
        mode: mode === 'PROCTORED' ? 'PROCTORED' : 'PRACTICE',
        randomizeOrder: !!randomizeOrder,
        negativeMarking: Number(negativeMarking) || 0,
        passScore: passScore != null && passScore !== '' ? parseInt(passScore, 10) : null,
        createdById: req.userId,
        sections: {
          create: sections.map((s: any, i: number) => ({
            title: s.title || `Section ${i + 1}`,
            kind: s.kind || 'MIXED',
            selectionRule: s.selectionRule ?? undefined,
            marksPerQuestion: Number(s.marksPerQuestion) || 1,
            order: i,
          })),
        },
      },
      include: { sections: true },
    });
    res.json(test);
  } catch (error) {
    console.error('Create test error:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
});

// PUT /assessments/:id — replace definition (sections are recreated)
router.put('/:id', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, durationMinutes, mode, randomizeOrder, negativeMarking, passScore, sections } = req.body;
    const existing = await prisma.assessmentTest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Test not found' });

    await prisma.testSectionItem.deleteMany({ where: { section: { testId: existing.id } } });
    await prisma.testSection.deleteMany({ where: { testId: existing.id } });
    const test = await prisma.assessmentTest.update({
      where: { id: existing.id },
      data: {
        title: title ?? existing.title,
        description: description ?? existing.description,
        durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : existing.durationMinutes,
        mode: mode === 'PROCTORED' ? 'PROCTORED' : 'PRACTICE',
        randomizeOrder: !!randomizeOrder,
        negativeMarking: Number(negativeMarking) || 0,
        passScore: passScore != null && passScore !== '' ? parseInt(passScore, 10) : null,
        sections: {
          create: (sections || []).map((s: any, i: number) => ({
            title: s.title || `Section ${i + 1}`,
            kind: s.kind || 'MIXED',
            selectionRule: s.selectionRule ?? undefined,
            marksPerQuestion: Number(s.marksPerQuestion) || 1,
            order: i,
          })),
        },
      },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    res.json(test);
  } catch (error) {
    console.error('Update test error:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
});

// POST /assessments/:id/publish | /archive
router.post('/:id/publish', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const test = await prisma.assessmentTest.update({
      where: { id: req.params.id },
      data: { status: 'PUBLISHED' },
    });
    res.json(test);
  } catch {
    res.status(404).json({ error: 'Test not found' });
  }
});
router.post('/:id/archive', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const test = await prisma.assessmentTest.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED' },
    });
    res.json(test);
  } catch {
    res.status(404).json({ error: 'Test not found' });
  }
});

// GET /assessments/manage — all tests, admin view
router.get('/manage', ...adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const tests = await prisma.assessmentTest.findMany({
      include: {
        sections: { orderBy: { order: 'asc' } },
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tests);
  } catch (error) {
    console.error('Manage list error:', error);
    res.status(500).json({ error: 'Failed to list tests' });
  }
});

// ===== Student flow =====

// GET /assessments/available — published tests + my attempt status
router.get('/available', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tests = await prisma.assessmentTest.findMany({
      // contest-backed tests are surfaced only in the Contests hub, not here
      where: { status: 'PUBLISHED', contest: { is: null } },
      select: {
        id: true,
        title: true,
        description: true,
        durationMinutes: true,
        mode: true,
        negativeMarking: true,
        passScore: true,
        company: { select: { name: true } },
        sections: { select: { title: true, kind: true }, orderBy: { order: 'asc' } },
        attempts: {
          where: { userId: req.userId! },
          select: { id: true, status: true, score: true, startedAt: true },
          orderBy: { startedAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tests);
  } catch (error) {
    console.error('Available tests error:', error);
    res.status(500).json({ error: 'Failed to list tests' });
  }
});

// POST /assessments/:id/start — creates or resumes an attempt
router.post('/:id/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await startAttempt(req.userId!, req.params.id);
    res.json(payload);
  } catch (error: any) {
    console.error('Start attempt error:', error);
    res.status(400).json({ error: error.message || 'Failed to start attempt' });
  }
});

// GET /assessments/attempts/:attemptId — resume payload (authoritative clock)
router.get('/attempts/:attemptId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAttemptPayload(req.params.attemptId, req.userId!));
  } catch (error: any) {
    res.status(404).json({ error: error.message || 'Attempt not found' });
  }
});

// POST /assessments/attempts/:attemptId/responses — autosave
router.post('/attempts/:attemptId/responses', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await saveResponse(req.params.attemptId, req.userId!, req.body));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to save response' });
  }
});

// POST /assessments/attempts/:attemptId/submit
router.post('/attempts/:attemptId/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const attempt = await prisma.testAttempt.findUnique({ where: { id: req.params.attemptId } });
    if (!attempt || attempt.userId !== req.userId) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    await gradeAttempt(attempt.id, 'SUBMITTED');
    res.json(await getAttemptReview(attempt.id, req.userId!));
  } catch (error: any) {
    console.error('Submit attempt error:', error);
    res.status(400).json({ error: error.message || 'Failed to submit attempt' });
  }
});

// GET /assessments/attempts/:attemptId/review — post-submit review
router.get('/attempts/:attemptId/review', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAttemptReview(req.params.attemptId, req.userId!));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to fetch review' });
  }
});

// POST /assessments/attempts/:attemptId/practice-weak — builds a personal
// PRACTICE test (ONE_PER_TOPIC) from this attempt's weak topics
router.post('/attempts/:attemptId/practice-weak', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await createWeakTopicPractice(req.userId!, req.params.attemptId));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to build practice test' });
  }
});

// ===== Proctoring =====

// POST /assessments/attempts/:attemptId/consent — records monitoring consent,
// returns the full payload (PROCTORED items are withheld until this is called)
router.post('/attempts/:attemptId/consent', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await recordConsent(req.params.attemptId, req.userId!));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record consent' });
  }
});

// POST /assessments/attempts/:attemptId/events — batched activity signals
// Body: { events: [{ type, meta?, at? }] }
router.post('/attempts/:attemptId/events', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const attempt = await ownedOpenAttempt(req.params.attemptId, req.userId!);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    const valid = events.filter((e: any) => PROCTORING_EVENT_TYPES.has(e?.type) && e.type !== 'SNAPSHOT');
    if (valid.length > 0) {
      await prisma.proctoringEvent.createMany({
        data: valid.map((e: any) => ({
          attemptId: attempt.id,
          type: e.type,
          meta: e.meta ?? undefined,
          createdAt: e.at ? new Date(e.at) : undefined,
        })),
      });
    }
    res.json({ recorded: valid.length });
  } catch (error) {
    console.error('Proctoring events error:', error);
    res.status(500).json({ error: 'Failed to record events' });
  }
});

// POST /assessments/attempts/:attemptId/snapshot — low-res webcam frame
// Body: { image: "data:image/jpeg;base64,..." }  (limit raised for this route only)
router.post(
  '/attempts/:attemptId/snapshot',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const attempt = await ownedOpenAttempt(req.params.attemptId, req.userId!);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      if (attempt.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Attempt closed' });

      const match = /^data:image\/jpeg;base64,(.+)$/.exec(req.body?.image || '');
      if (!match) return res.status(400).json({ error: 'image must be a base64 JPEG data URL' });
      const buf = Buffer.from(match[1], 'base64');
      if (buf.length > 1_000_000) return res.status(413).json({ error: 'snapshot too large' });

      const dir = path.join(SNAPSHOT_DIR, attempt.id);
      fs.mkdirSync(dir, { recursive: true });
      const file = `${Date.now()}.jpg`;
      fs.writeFileSync(path.join(dir, file), buf);

      await prisma.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          type: 'SNAPSHOT',
          snapshotUrl: `/admin/attempts/${attempt.id}/snapshots/${file}`,
          meta: { bytes: buf.length },
        },
      });
      res.json({ saved: true });
    } catch (error) {
      console.error('Snapshot error:', error);
      res.status(500).json({ error: 'Failed to store snapshot' });
    }
  }
);

export default router;
