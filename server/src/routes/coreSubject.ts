import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { checkPipelineGates } from '../services/pipelineService';

const router = Router();

// GET /core-subjects/summary
router.get('/summary', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const subjects = ['CN', 'OS', 'DBMS', 'SQL'];
    const counts: Record<string, number> = {};
    for (const sub of subjects) {
      counts[sub] = await prisma.coreSubjectQuestion.count({ where: { subject: sub } });
    }
    res.json({ subjects: counts });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch core subject summary' });
  }
});

// GET /core-subjects/:subject/quiz
router.get('/:subject/quiz', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const subject = (req.params.subject || '').toUpperCase();
    const questions = await prisma.coreSubjectQuestion.findMany({
      where: { subject },
      take: 50,
    });

    if (!questions.length) {
      return res.status(404).json({ error: `No questions found for subject ${subject}` });
    }

    // shuffle and pick 10
    const selected = questions.sort(() => 0.5 - Math.random()).slice(0, 10);
    const sanitized = selected.map((q) => ({
      id: q.id,
      subject: q.subject,
      question: q.question,
      options: q.options,
      explanation: q.explanation,
      difficulty: q.difficulty,
    }));

    res.json({ subject, questions: sanitized });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch quiz' });
  }
});

// POST /core-subjects/submit-quiz
router.post('/submit-quiz', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { answers } = req.body as { answers: { questionId: string; selectedIndex: number }[] };

    if (!Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ error: 'Answers array required' });
    }

    const qIds = answers.map((a) => a.questionId);
    const questions = await prisma.coreSubjectQuestion.findMany({
      where: { id: { in: qIds } },
    });

    let correctCount = 0;
    const details = answers.map((a) => {
      const q = questions.find((item) => item.id === a.questionId);
      const isCorrect = q ? q.answerIndex === a.selectedIndex : false;
      if (isCorrect) correctCount++;
      return {
        questionId: a.questionId,
        isCorrect,
        correctIndex: q ? q.answerIndex : 0,
        explanation: q ? q.explanation : '',
      };
    });

    const xpEarned = correctCount * 15;
    if (xpEarned > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { xpTotal: { increment: xpEarned } },
      });
    }

    const percentage = Math.round((correctCount / answers.length) * 100);

    // Pipeline gate: match on subject + score. Non-fatal on failure.
    const anyQ = questions[0];
    if (anyQ) {
      try {
        await checkPipelineGates(userId, {
          type: 'quiz-submitted',
          source: 'core-subject',
          subject: anyQ.subject,
          scorePct: percentage,
        });
      } catch (e) {
        console.warn('Pipeline gate check failed (non-fatal):', e);
      }
    }

    res.json({
      score: correctCount,
      total: answers.length,
      percentage,
      xpEarned,
      details,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to submit quiz' });
  }
});

export default router;
