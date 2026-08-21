import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  startInterview,
  reply,
  finishInterview,
  scoreCodingInterview,
  getInterview,
  listInterviews,
  recordProctoringSummary,
  recordDelivery,
} from '../services/aiInterviewService';
import { synthesizeSpeech } from '../services/ttsService';

const router = Router();

// POST /ai-interview/tts { text, voice? } -> audio/mpeg
// Free neural voice for the interviewer (Microsoft Edge Read-Aloud, no API key).
// The client plays this through a Web Audio AnalyserNode for real lip-sync, and
// falls back to the browser's speechSynthesis voice if this errors.
router.post('/tts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const text = (req.body?.text ?? '').toString().trim().slice(0, 1500);
    if (!text) return res.status(400).json({ error: 'text required' });
    const audio = await synthesizeSpeech(text, req.body?.voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio);
  } catch (error: any) {
    console.error('TTS error:', error?.message || error);
    return res.status(502).json({ error: 'TTS unavailable' });
  }
});

// GET /ai-interview — my past interviews
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listInterviews(req.userId!));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list interviews' });
  }
});

import { parseResumePdf } from '../services/resumeService';

// POST /ai-interview/parse-resume { pdfBase64 }
router.post('/parse-resume', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const b64 = req.body?.pdfBase64;
    if (!b64 || typeof b64 !== 'string') {
      return res.status(400).json({ error: 'pdfBase64 string required' });
    }
    const cleanB64 = b64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const parsed = await parseResumePdf(buffer);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Resume parse error:', error);
    return res.status(400).json({ error: error.message || 'Failed to parse resume PDF' });
  }
});

// POST /ai-interview/start { role, companyId?, roundType?, resumeData? }
router.post('/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await startInterview(req.userId!, req.body?.role, req.body?.companyId, req.body?.roundType, req.body?.resumeData));
  } catch (error: any) {
    console.error('Interview start error:', error);
    res.status(400).json({ error: error.message || 'Failed to start interview' });
  }
});

// POST /ai-interview/:id/reply { content }
router.post('/:id/reply', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await reply(req.params.id, req.userId!, req.body?.content));
  } catch (error: any) {
    console.error('Interview reply error:', error);
    res.status(400).json({ error: error.message || 'Failed to send answer' });
  }
});

// POST /ai-interview/:id/score-coding { problemId, code, language, passed, total, elapsedMinutes }
router.post('/:id/score-coding', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await scoreCodingInterview(req.params.id, req.userId!, req.body));
  } catch (error: any) {
    console.error('Coding score error:', error);
    res.status(400).json({ error: error.message || 'Failed to score coding submission' });
  }
});

// POST /ai-interview/:id/finish — end early and score
router.post('/:id/finish', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await finishInterview(req.params.id, req.userId!));
  } catch (error: any) {
    console.error('Interview finish error:', error);
    res.status(400).json({ error: error.message || 'Failed to finish interview' });
  }
});

// POST /ai-interview/:id/delivery { avgWpm, totalFillers, voiceAnswers, answers }
// Speech-delivery cues from the voice room — informational, never scored.
router.post('/:id/delivery', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await recordDelivery(req.params.id, req.userId!, req.body || {}));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record delivery' });
  }
});

// POST /ai-interview/:id/proctoring-summary { counts } — face-presence signal
// from the video interview (FACE_NOT_DETECTED / MULTIPLE_FACES / NO_CAMERA)
router.post('/:id/proctoring-summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await recordProctoringSummary(req.params.id, req.userId!, req.body?.counts));
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record summary' });
  }
});

// GET /ai-interview/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getInterview(req.params.id, req.userId!));
  } catch (error: any) {
    res.status(404).json({ error: error.message || 'Interview not found' });
  }
});

export default router;
