import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { chat, extractJson } from './llmService';

// STAR Roleplay game backend. Given an HR question, generates (and caches)
// 4 candidate answers — 1 strong STAR + 3 weakened variants (vague, blame,
// generic). Cached per HrQuestion.id in GameContent so we don't re-call the
// LLM every play. See plan-comprehensive-reports.md Part A.

const PROMPT_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');
function loadPrompt(name: string, vars: Record<string, string>): string {
  let text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
  return text;
}

export interface StarAnswer {
  text: string;
  quality: 'strong' | 'weak-vague' | 'weak-blame' | 'weak-generic';
  why: string;
}
export interface StarRoleplayPayload {
  question: string;
  category: string;
  answers: StarAnswer[];         // shuffled order — client shows as-is
  correctIndex: number;          // 0-based index of the "strong" answer AFTER shuffle
}

// Fisher-Yates
function shuffle<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

async function generateForQuestion(hrQuestionId: string): Promise<StarRoleplayPayload> {
  const q = await prisma.hrQuestion.findUnique({ where: { id: hrQuestionId } });
  if (!q) throw new Error(`HrQuestion ${hrQuestionId} not found`);

  const prompt = loadPrompt('game-star-roleplay', {
    question: q.question,
    category: q.category,
    starGuidance: (q.starGuidance || '').slice(0, 1200),
  });
  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 1200 });
  const parsed = extractJson<{ answers?: StarAnswer[] }>(raw);
  if (!parsed?.answers || parsed.answers.length < 4) {
    throw new Error('LLM did not return 4 candidate answers');
  }

  // Take the first 4, shuffle, remember where the strong one landed
  const four = parsed.answers.slice(0, 4);
  const shuffled = shuffle(four.map((a, i) => ({ ...a, _origIdx: i })));
  const correctIndex = shuffled.findIndex((a) => a.quality === 'strong');
  const answers: StarAnswer[] = shuffled.map(({ _origIdx: _, ...rest }) => rest);

  return { question: q.question, category: q.category, answers, correctIndex };
}

// Cache-first per (gameType, refId=hrQuestionId). Regenerates only via
// explicit admin route (not exposed here).
export async function getOrGenerateStarRoleplay(hrQuestionId: string): Promise<{
  id: string;
  payload: StarRoleplayPayload;
}> {
  const existing = await prisma.gameContent.findFirst({
    where: { gameType: 'STAR_ROLEPLAY', refId: hrQuestionId },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return { id: existing.id, payload: existing.payload as any as StarRoleplayPayload };
  }

  const payload = await generateForQuestion(hrQuestionId);
  const row = await prisma.gameContent.create({
    data: {
      gameType: 'STAR_ROLEPLAY',
      subject: 'HR',
      refId: hrQuestionId,
      payload: payload as any,
      source: 'llm-groq',
    },
  });
  return { id: row.id, payload };
}

// Pick a random HR question and return its (cached or freshly generated)
// STAR roleplay puzzle. Used by GET /games-content/star-roleplay/random.
export async function randomStarRoleplay(): Promise<{ id: string; payload: StarRoleplayPayload }> {
  // Prefer questions we've already cached — instant, no LLM cost
  const cached = await prisma.gameContent.findMany({
    where: { gameType: 'STAR_ROLEPLAY' },
    take: 30,
    orderBy: { createdAt: 'desc' },
  });
  if (cached.length > 0) {
    const pick = cached[Math.floor(Math.random() * cached.length)];
    return { id: pick.id, payload: pick.payload as any as StarRoleplayPayload };
  }

  // Otherwise generate one from a random HR question
  const count = await prisma.hrQuestion.count();
  if (count === 0) throw new Error('No HR questions seeded');
  const skip = Math.floor(Math.random() * count);
  const q = await prisma.hrQuestion.findMany({ skip, take: 1 });
  return getOrGenerateStarRoleplay(q[0].id);
}
