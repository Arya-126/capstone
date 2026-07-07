import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  runAgainstCases,
  runSubmission,
  runnerAvailable,
  LANGUAGES,
} from '../services/codeRunnerService';

const router = Router();

// Simple per-user rate limit for the expensive sandbox endpoints.
const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 10;
const runCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: AuthRequest, res: Response, next: NextFunction) {
  const key = req.userId || req.ip || 'anon';
  const now = Date.now();
  const entry = runCounts.get(key);
  if (!entry || now > entry.resetAt) {
    runCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= MAX_RUNS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many runs — wait a minute and try again' });
  }
  entry.count++;
  next();
}

// GET /code/problems — list (no statements, no tests)
router.get('/problems', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const problems = await prisma.codingProblem.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        difficulty: true,
        verified: true,
        companies: true,
        topic: { select: { name: true, slug: true } },
      },
      orderBy: [{ topic: { order: 'asc' } }, { difficulty: 'asc' }],
    });
    res.json(problems);
  } catch (error) {
    console.error('List problems error:', error);
    res.status(500).json({ error: 'Failed to list problems' });
  }
});

// GET /code/problems/:slug — statement + samples + starter code (never hidden tests or reference)
router.get('/problems/:slug', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const problem = await prisma.codingProblem.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        title: true,
        slug: true,
        statement: true,
        difficulty: true,
        constraints: true,
        sampleIo: true,
        starterCode: true,
        timeLimitMs: true,
        memoryLimitMb: true,
        sourceUrl: true,
        companies: true,
        topic: { select: { name: true, slug: true } },
      },
    });
    if (!problem) return res.status(404).json({ error: 'Problem not found' });
    res.json({ ...problem, languages: Object.keys(LANGUAGES) });
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ error: 'Failed to fetch problem' });
  }
});

// POST /code/scratch { language, source, stdin? } — freeform run for the
// coding-in-interview pad. No problem, no grading: just executes once and
// returns stdout/stderr. Sandboxed (Piston) + rate-limited like the others.
router.post('/scratch', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { language, source, stdin } = req.body;
    if (!language || !source) {
      return res.status(400).json({ error: 'language and source are required' });
    }
    if (!LANGUAGES[language]) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }
    if (!(await runnerAvailable())) {
      return res.status(503).json({ error: 'Code runner is not available — is the Piston container running?' });
    }
    const r = await runSubmission({
      source,
      language,
      stdin: (stdin ?? '').toString(),
      timeLimitMs: 3000, // Piston caps run_timeout at 3000ms
      memoryLimitMb: 256,
    });
    res.json({
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      compileOutput: r.compileOutput,
      timeSec: r.timeSec,
    });
  } catch (error: any) {
    console.error('Scratch run error:', error);
    res.status(500).json({ error: error.message || 'Run failed' });
  }
});

// POST /code/run { problemId, language, source } — sample tests only, full output shown
router.post('/run', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { problemId, language, source } = req.body;
    if (!problemId || !language || !source) {
      return res.status(400).json({ error: 'problemId, language and source are required' });
    }
    if (!(await runnerAvailable())) {
      return res.status(503).json({ error: 'Code runner is not available — is the Piston container running?' });
    }

    const problem = await prisma.codingProblem.findUnique({
      where: { id: problemId },
      include: { testCases: { where: { isSample: true } } },
    });
    if (!problem) return res.status(404).json({ error: 'Problem not found' });

    const results = await runAgainstCases(source, language, problem.testCases, {
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
    });

    res.json({
      results: results.map((r, i) => ({
        case: i + 1,
        status: r.status,
        passed: r.passed,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        expected: problem.testCases[r.caseIndex]?.expectedOutput,
        timeSec: r.timeSec,
      })),
      passed: results.filter((r) => r.passed).length,
      total: problem.testCases.length,
    });
  } catch (error: any) {
    console.error('Run error:', error);
    res.status(500).json({ error: error.message || 'Run failed' });
  }
});

// POST /code/submit { problemId, language, source, attemptId? }
// Hidden tests; reveals status categories, never hidden inputs/outputs.
router.post('/submit', authMiddleware, rateLimit, async (req: AuthRequest, res: Response) => {
  try {
    const { problemId, language, source, attemptId } = req.body;
    if (!problemId || !language || !source) {
      return res.status(400).json({ error: 'problemId, language and source are required' });
    }
    if (!(await runnerAvailable())) {
      return res.status(503).json({ error: 'Code runner is not available — is the Piston container running?' });
    }

    const problem = await prisma.codingProblem.findUnique({
      where: { id: problemId },
      include: { testCases: true },
    });
    if (!problem) return res.status(404).json({ error: 'Problem not found' });

    const results = await runAgainstCases(source, language, problem.testCases, {
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
    });

    const totalWeight = problem.testCases.reduce((s, c) => s + c.weight, 0);
    const passedWeight = results
      .filter((r) => r.passed)
      .reduce((s, r) => s + r.weight, 0);
    const score = totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 0;
    const allPassed = results.length === problem.testCases.length && results.every((r) => r.passed);

    // track progress: every submit marks the problem attempted; a 100% hidden-test
    // pass marks it SOLVED (feeds the coding-track map + coding leaderboard)
    try {
      const existing = await prisma.userProblemStatus.findUnique({
        where: { userId_problemId: { userId: req.userId!, problemId } },
      });
      const nowSolved = allPassed || existing?.status === 'SOLVED';
      await prisma.userProblemStatus.upsert({
        where: { userId_problemId: { userId: req.userId!, problemId } },
        update: {
          status: nowSolved ? 'SOLVED' : 'ATTEMPTED',
          bestScore: Math.max(existing?.bestScore ?? 0, score),
          attempts: { increment: 1 },
          ...(allPassed && existing?.status !== 'SOLVED' ? { solvedAt: new Date() } : {}),
        },
        create: {
          userId: req.userId!,
          problemId,
          status: allPassed ? 'SOLVED' : 'ATTEMPTED',
          bestScore: score,
          attempts: 1,
          ...(allPassed ? { solvedAt: new Date() } : {}),
        },
      });
    } catch (e) {
      console.warn('UserProblemStatus update failed (non-fatal):', e);
    }

    // During a test attempt (Phase 4), persist the response server-side
    if (attemptId) {
      const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
      if (attempt && attempt.userId === req.userId && attempt.status === 'IN_PROGRESS') {
        await prisma.attemptResponse.upsert({
          where: {
            attemptId_codingProblemId: { attemptId, codingProblemId: problemId },
          },
          update: {
            answer: { language, code: source, score, passed: passedWeight, total: totalWeight },
            isCorrect: allPassed,
            marks: score / 100,
          },
          create: {
            attemptId,
            codingProblemId: problemId,
            answer: { language, code: source, score, passed: passedWeight, total: totalWeight },
            isCorrect: allPassed,
            marks: score / 100,
          },
        });
      }
    }

    res.json({
      passed: results.filter((r) => r.passed).length,
      total: problem.testCases.length,
      score: Math.round(score * 10) / 10,
      allPassed,
      // category breakdown only — hidden inputs are never revealed
      breakdown: results.map((r, i) => ({
        case: i + 1,
        sample: r.isSample,
        status: r.status,
        timeSec: r.timeSec,
      })),
      compileOutput: results[0]?.compileOutput ?? null,
    });
  } catch (error: any) {
    console.error('Submit error:', error);
    res.status(500).json({ error: error.message || 'Submit failed' });
  }
});

export default router;
