import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getReport, listReports } from '../services/reportService';
import { getOrGenerateSynopsis, regenerateSynopsis } from '../services/synopsisService';

const router = Router();

// GET /reports/:id — full report (owner-checked)
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const report = await getReport(req.userId!, req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch report' });
  }
});

// GET /reports — my recent reports (for prep tracker etc.)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    res.json(await listReports(req.userId!, limit));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list reports' });
  }
});

// ---- synopsis endpoints (paired here since UI fetches both together) ----

// GET /reports/synopsis/:subject/:concept — cache-first
router.get(
  '/synopsis/:subject/:concept',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const synopsis = await getOrGenerateSynopsis({
        subject: decodeURIComponent(req.params.subject),
        concept: decodeURIComponent(req.params.concept),
      });
      res.json(synopsis);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch synopsis' });
    }
  },
);

// POST /reports/synopsis/:subject/:concept/regenerate — force refresh (any user;
// synopses are shared. Consider admin-gating later.)
router.post(
  '/synopsis/:subject/:concept/regenerate',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const synopsis = await regenerateSynopsis({
        subject: decodeURIComponent(req.params.subject),
        concept: decodeURIComponent(req.params.concept),
      });
      res.json(synopsis);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to regenerate synopsis' });
    }
  },
);

export default router;
