import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { chat, extractJson } from './llmService';

// Bug Hunt + Dry-Run — both take a CodingProblem reference solution and
// derive a puzzle via LLM. Same cache-first pattern as starRoleplayService:
// GameContent keyed by (gameType, refId=CodingProblem.id).
//
// Pre-generation: use scripts/generate-game-content.ts to batch-cook
// puzzles ahead of time. On-demand fallback picks a random verified problem
// and generates one — first play is slow, subsequent are cache-hit fast.

const PROMPT_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');
function loadPrompt(name: string, vars: Record<string, string>): string {
  let text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
  return text;
}

// Prefer languages in this order (widest reach + easiest to reason about)
const PREF_LANGS = ['python', 'javascript', 'java', 'cpp'];

function pickLanguage(refSol: Record<string, string> | null): { lang: string; code: string } | null {
  if (!refSol) return null;
  for (const l of PREF_LANGS) if (refSol[l]) return { lang: l, code: refSol[l] };
  const keys = Object.keys(refSol);
  return keys.length > 0 ? { lang: keys[0], code: refSol[keys[0]] } : null;
}

// ================= BUG HUNT =================

export interface BugHuntPayload {
  problemTitle: string;
  language: string;
  statement: string;
  buggyCode: string;
  bugLines: number[];
  bugDescriptions: string[];
  hint: string;
}

export async function generateBugHunt(problemId: string, bugCount = 2): Promise<BugHuntPayload | null> {
  const p = await prisma.codingProblem.findUnique({ where: { id: problemId } });
  if (!p) return null;
  const picked = pickLanguage(p.referenceSolution as any);
  if (!picked) return null;

  const prompt = loadPrompt('game-bug-hunt', {
    problemTitle: p.title,
    statement: (p.statement || '').slice(0, 800),
    language: picked.lang,
    referenceCode: picked.code.slice(0, 3000),
    bugCount: String(bugCount),
  });
  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 1400 });
  const parsed = extractJson<{
    buggyCode?: string;
    bugLines?: number[];
    bugDescriptions?: string[];
    hint?: string;
  }>(raw);

  if (!parsed?.buggyCode || !Array.isArray(parsed.bugLines) || parsed.bugLines.length === 0) return null;

  return {
    problemTitle: p.title,
    language: picked.lang,
    statement: (p.statement || '').slice(0, 400),
    buggyCode: parsed.buggyCode.slice(0, 4000),
    bugLines: parsed.bugLines.slice(0, 5).filter((n: any) => Number.isInteger(n) && n > 0),
    bugDescriptions: (parsed.bugDescriptions || []).slice(0, 5).map((d) => String(d).slice(0, 200)),
    hint: (parsed.hint || 'Read carefully line by line').slice(0, 200),
  };
}

export async function getOrGenerateBugHunt(problemId: string): Promise<{ id: string; payload: BugHuntPayload } | null> {
  const cached = await prisma.gameContent.findFirst({
    where: { gameType: 'BUG_HUNT', refId: problemId },
    orderBy: { createdAt: 'desc' },
  });
  if (cached) return { id: cached.id, payload: cached.payload as any };

  const payload = await generateBugHunt(problemId);
  if (!payload) return null;
  const row = await prisma.gameContent.create({
    data: { gameType: 'BUG_HUNT', subject: 'DSA', refId: problemId, payload: payload as any, source: 'llm-groq' },
  });
  return { id: row.id, payload };
}

// ================= DRY RUN =================

export interface DryRunPayload {
  problemTitle: string;
  language: string;
  snippet: string;
  input: string;
  expectedOutput: string;
  hint: string;
}

export async function generateDryRun(problemId: string): Promise<DryRunPayload | null> {
  const p = await prisma.codingProblem.findUnique({ where: { id: problemId } });
  if (!p) return null;
  const picked = pickLanguage(p.referenceSolution as any);
  if (!picked) return null;

  const prompt = loadPrompt('game-dry-run', {
    problemTitle: p.title,
    statement: (p.statement || '').slice(0, 600),
    language: picked.lang,
    referenceCode: picked.code.slice(0, 2500),
  });
  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 1200 });
  const parsed = extractJson<{
    snippet?: string;
    input?: string;
    expectedOutput?: string;
    hint?: string;
  }>(raw);
  if (!parsed?.snippet || parsed.expectedOutput == null) return null;

  return {
    problemTitle: p.title,
    language: picked.lang,
    snippet: parsed.snippet.slice(0, 3000),
    input: (parsed.input || '').slice(0, 500),
    expectedOutput: parsed.expectedOutput.slice(0, 200),
    hint: (parsed.hint || 'Trace the code line-by-line').slice(0, 200),
  };
}

export async function getOrGenerateDryRun(problemId: string): Promise<{ id: string; payload: DryRunPayload } | null> {
  const cached = await prisma.gameContent.findFirst({
    where: { gameType: 'DRY_RUN', refId: problemId },
    orderBy: { createdAt: 'desc' },
  });
  if (cached) return { id: cached.id, payload: cached.payload as any };

  const payload = await generateDryRun(problemId);
  if (!payload) return null;
  const row = await prisma.gameContent.create({
    data: { gameType: 'DRY_RUN', subject: 'DSA', refId: problemId, payload: payload as any, source: 'llm-groq' },
  });
  return { id: row.id, payload };
}

// ================= random pickers =================

async function pickRandomProblem(): Promise<string | null> {
  const verified = await prisma.codingProblem.findMany({
    where: { verified: true, referenceSolution: { not: null as any } },
    select: { id: true },
    take: 60,
  });
  const pool = verified.length > 0
    ? verified
    : await prisma.codingProblem.findMany({
        where: { referenceSolution: { not: null as any } },
        select: { id: true },
        take: 60,
      });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

async function randomFromCache(gameType: 'BUG_HUNT' | 'DRY_RUN') {
  const cached = await prisma.gameContent.findMany({
    where: { gameType },
    take: 40,
    orderBy: { createdAt: 'desc' },
  });
  if (cached.length === 0) return null;
  const pick = cached[Math.floor(Math.random() * cached.length)];
  return { id: pick.id, payload: pick.payload as any };
}

export async function randomBugHunt() {
  const c = await randomFromCache('BUG_HUNT');
  if (c) return c;
  const pid = await pickRandomProblem();
  if (!pid) throw new Error('No coding problems available for Bug Hunt');
  const g = await getOrGenerateBugHunt(pid);
  if (!g) throw new Error('Could not generate a Bug Hunt puzzle');
  return g;
}

export async function randomDryRun() {
  const c = await randomFromCache('DRY_RUN');
  if (c) return c;
  const pid = await pickRandomProblem();
  if (!pid) throw new Error('No coding problems available for Dry-Run');
  const g = await getOrGenerateDryRun(pid);
  if (!g) throw new Error('Could not generate a Dry-Run puzzle');
  return g;
}
