import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { chat, extractJson } from './llmService';

// Cached LLM synopsis per (subject, concept). Shared across users and
// reports — one LLM call warms it for everyone. See
// plan-comprehensive-reports.md Part C.
//
// Never invalidates automatically — a synopsis of "TCP 3-way handshake"
// doesn't go stale. Admin-triggered regeneration exists at /synopses/regenerate.

const PROMPT_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');

function loadPrompt(name: string, vars: Record<string, string>): string {
  let text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
  return text;
}

// Deterministic subject → games mapping (see gameRecommenderService.ts spec
// in the plan). Inlined here for MVP — full recommender lands in Sprint 2.
const GAME_FIT: Record<string, { gameType: string; reason: string }[]> = {
  OS:       [{ gameType: 'CONCEPT_CANNON', reason: 'True/false rapid-fire on OS concepts' },
             { gameType: 'MCQ',            reason: 'Targeted MCQ practice on the concept' }],
  CN:       [{ gameType: 'CONCEPT_CANNON', reason: 'True/false rapid-fire on CN concepts' },
             { gameType: 'MCQ',            reason: 'Targeted MCQ practice on the concept' }],
  DBMS:     [{ gameType: 'MCQ',            reason: 'Targeted MCQ practice' },
             { gameType: 'FILL_BLANK',     reason: 'Fill in the SQL / definition blanks' }],
  SQL:      [{ gameType: 'FILL_BLANK',     reason: 'Complete SQL statements' },
             { gameType: 'MCQ',            reason: 'Targeted MCQ practice' }],
  DSA:      [{ gameType: 'MCQ',            reason: 'Targeted MCQ practice' },
             { gameType: 'MEMORY_MATCH',   reason: 'Pair algorithms with their complexities' }],
  HR:       [{ gameType: 'CONCEPT_CANNON', reason: 'Pick the strongest STAR response' }],
  Aptitude: [{ gameType: 'MCQ',            reason: 'Timed MCQ practice on the topic' }],
};

function recommendGamesFor(subject: string): { gameType: string; reason: string }[] {
  return GAME_FIT[subject] || GAME_FIT.Aptitude;
}

export interface SynopsisInput {
  subject: string;
  concept: string;
}

export async function getOrGenerateSynopsis({ subject, concept }: SynopsisInput) {
  const key = { subject: subject.trim(), concept: concept.trim() };
  if (!key.subject || !key.concept) throw new Error('subject and concept required');

  // Cache-first — return existing row untouched
  const cached = await prisma.conceptSynopsis.findUnique({
    where: { subject_concept: key },
  });
  if (cached) return cached;

  // LLM call — wrapped so a failure returns a safe placeholder rather than
  // crashing the report flow
  let synopsis = `${key.concept} is a core concept in ${key.subject}. Review the linked theory and try the recommended practice.`;
  let bulletKeys: string[] = [`Study ${key.concept} in ${key.subject}`, 'Try recommended MCQs', 'Retake the quiz once concepts feel solid'];
  let commonMistakes: string | null = null;

  try {
    const prompt = loadPrompt('concept-synopsis', { subject: key.subject, concept: key.concept });
    const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 800 });
    const parsed = extractJson<{
      synopsis?: string;
      bulletKeys?: string[];
      commonMistakes?: string;
    }>(raw);
    if (parsed?.synopsis) {
      synopsis = parsed.synopsis.slice(0, 1200);
      if (Array.isArray(parsed.bulletKeys) && parsed.bulletKeys.length > 0) {
        bulletKeys = parsed.bulletKeys.slice(0, 5).map((b) => String(b).slice(0, 120));
      }
      if (parsed.commonMistakes) commonMistakes = String(parsed.commonMistakes).slice(0, 400);
    }
  } catch (err: any) {
    console.warn(`synopsis LLM failed for ${key.subject}/${key.concept}:`, err?.message || err);
  }

  return prisma.conceptSynopsis.create({
    data: {
      subject: key.subject,
      concept: key.concept,
      synopsis,
      bulletKeys,
      commonMistakes,
      recommendedGames: recommendGamesFor(key.subject) as any,
      generatedBy: 'groq',
    },
  });
}

export async function regenerateSynopsis(input: SynopsisInput) {
  const key = { subject: input.subject.trim(), concept: input.concept.trim() };
  await prisma.conceptSynopsis.deleteMany({ where: key });
  return getOrGenerateSynopsis(key);
}
