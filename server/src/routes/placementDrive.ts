import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  startPlacementDrive,
  attachResumeToDrive,
  startDriveRound,
  completePlacementDrive,
  getPlacementDrive,
} from '../services/placementDriveService';

const router = Router();

// POST /placement-drive/start { companyId?, role? }
router.post('/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const drive = await startPlacementDrive(userId, req.body?.companyId, req.body?.role);
    res.json(drive);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to start placement drive' });
  }
});

// POST /placement-drive/:id/resume { resumeData }
router.post('/:id/resume', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const drive = await attachResumeToDrive(req.params.id, userId, req.body?.resumeData);
    res.json(drive);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to attach resume to drive' });
  }
});

// POST /placement-drive/:id/start-round { roundType, role? }
router.post('/:id/start-round', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await startDriveRound(
      req.params.id,
      userId,
      req.body?.roundType || 'hr',
      req.body?.role || 'SDE (Generalist)'
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to start drive round' });
  }
});

// POST /placement-drive/:id/complete
router.post('/:id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await completePlacementDrive(req.params.id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to complete placement drive' });
  }
});

// GET /placement-drive/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = await getPlacementDrive(req.params.id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message || 'Placement drive not found' });
  }
});

export default router;
