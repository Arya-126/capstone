import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  startDiagnostic,
  submitDiagnostic,
  getSkillProfile,
  DiagnosticResponse,
} from '../services/diagnosticService';

const router = Router();

// POST /diagnostic/start — create (or resume) an IN_PROGRESS attempt and
// return the 25-item snapshot with correct answers stripped
router.post('/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await startDiagnostic(req.userId!);
    res.json(result);
  } catch (error: any) {
    console.error('Diagnostic start error:', error);
    res.status(500).json({ error: error.message || 'Failed to start diagnostic' });
  }
});

// POST /diagnostic/:id/submit — grade + write UserSkillProfile
// body: { responses: [{ qId, chosenIndex?, passed?, total?, timeMs }] }
router.post('/:id/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const responses = req.body?.responses as DiagnosticResponse[] | undefined;
    if (!Array.isArray(responses)) {
      return res.status(400).json({ error: 'responses array required' });
    }
    const result = await submitDiagnostic(req.userId!, req.params.id, responses);
    res.json(result);
  } catch (error: any) {
    console.error('Diagnostic submit error:', error);
    res.status(400).json({ error: error.message || 'Failed to submit diagnostic' });
  }
});

// GET /skill-profile — returns UserSkillProfile or null (frontend uses null
// as the "not diagnosed yet" signal to redirect to the intro)
router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getSkillProfile(req.userId!);
    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

export default router;
