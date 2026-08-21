import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import {
  QuotaExhaustedError,
  isParked,
  ollamaAvailable,
  cloudAvailable,
} from './lib/llmClient';
import { draftStage, solveStage, casesStage, seedStage, Tier } from './stages/coding';

// Content-pipeline daemon (docs/content-pipeline-plan.md Part C).
//
// Advances coding items through PENDING → DRAFTED → SOLVED → CASES_OK →
// SEEDED → VERIFIED, finishing items closest to done first. LOCAL-FIRST:
// stages run on Ollama; after 2 local failures a stage escalates to the cloud
// fallback (Gemini/Groq). Daily cloud quota exhaustion parks the provider in
// quota-state.json (exit 0 — the hourly scheduled task simply runs us again).
//
// Usage: npx ts-node scripts/pipeline-daemon.ts [--budget 25] [--key <slug>]
//   --budget N  max LLM-bearing stage executions this run (default 25)
//   --key slug  process only this item (debugging)

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const BUDGET = flag('budget') ? parseInt(flag('budget')!, 10) : 25;
const ONLY_KEY = flag('key');

// stages that finish items first run first — a partial run still ships value
const STAGE_ORDER: { status: string; llm: boolean }[] = [
  { status: 'SEEDED', llm: false }, // Piston retry only
  { status: 'CASES_OK', llm: false }, // seed + verify, no LLM
  { status: 'SOLVED', llm: true }, // case generation
  { status: 'DRAFTED', llm: true }, // solutions
  { status: 'PENDING', llm: true }, // drafts
];

const LOCAL_ATTEMPTS_BEFORE_CLOUD = 2;
const MAX_STAGE_ATTEMPTS = 5;

function pickTier(item: any, stage: string, haveLocal: boolean): Tier | null {
  const attempts = item.payload?.stageAttempts?.[stage] ?? 0;
  const wantCloud = attempts >= LOCAL_ATTEMPTS_BEFORE_CLOUD || !haveLocal;
  if (!wantCloud) return 'local';
  // cloud needed: gemini covers draft/solveA/cases; groq covers solveB —
  // require both for the solve stage, gemini alone otherwise
  const need: ('gemini' | 'groq')[] = stage === 'DRAFTED' ? ['gemini', 'groq'] : ['gemini'];
  if (need.every((p) => cloudAvailable(p))) return 'cloud';
  // cloud parked/missing but local exists — keep trying locally rather than stall
  return haveLocal ? 'local' : null;
}

async function bumpAttempts(item: any, stage: string, error: string) {
  const stageAttempts = { ...(item.payload?.stageAttempts || {}) };
  stageAttempts[stage] = (stageAttempts[stage] ?? 0) + 1;
  const exhausted = stageAttempts[stage] >= MAX_STAGE_ATTEMPTS;
  await prisma.contentPipelineItem.update({
    where: { id: item.id },
    data: {
      status: exhausted ? 'NEEDS_REVIEW' : item.status,
      attempts: { increment: 1 },
      lastError: error.slice(0, 500),
      payload: { ...item.payload, stageAttempts },
    },
  });
  return exhausted;
}

// single-instance lock — hourly scheduled runs may overlap when local models
// are slow; the newer run simply defers to the one still working
const LOCK_PATH = path.join(__dirname, '..', 'prisma', 'data', 'daemon.lock');

function acquireLock(): boolean {
  try {
    const pid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8'), 10);
    if (pid) {
      try {
        process.kill(pid, 0); // throws if the process is gone
        return false; // previous run still alive
      } catch {
        /* stale lock */
      }
    }
  } catch {
    /* no lock file */
  }
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

async function main() {
  if (!acquireLock()) {
    console.log('[daemon] another instance is running — exiting');
    return;
  }
  process.on('exit', () => fs.rmSync(LOCK_PATH, { force: true }));

  const haveLocal = await ollamaAvailable();
  console.log(
    `[daemon] ${new Date().toISOString()} budget=${BUDGET} ollama=${haveLocal} gemini=${cloudAvailable('gemini')} groq=${cloudAvailable('groq')}` +
      (isParked('gemini') ? ' (gemini PARKED)' : '') +
      (isParked('groq') ? ' (groq PARKED)' : '')
  );
  if (!haveLocal && !cloudAvailable('gemini')) {
    console.log('[daemon] no LLM available (Ollama down, Gemini parked/missing) — exiting');
    return;
  }

  const counters = { llmSpent: 0, advanced: 0, failed: 0 };

  async function processStage(status: string, llm: boolean) {
    if (llm && counters.llmSpent >= BUDGET) return;

    const items = await prisma.contentPipelineItem.findMany({
      where: { kind: 'coding', status, ...(ONLY_KEY ? { key: ONLY_KEY } : {}) },
      orderBy: { priority: 'desc' },
      take: llm ? BUDGET : 100,
    });

    for (const item of items) {
      if (llm && counters.llmSpent >= BUDGET) break;
      const label = `${item.key} [${status}]`;

      try {
        if (status === 'SEEDED' || status === 'CASES_OK') {
          const result = await seedStage(item);
          console.log(`  ${label} → ${result}`);
          if (result === 'SEEDED' && status === 'SEEDED') break; // Piston still down — stop retrying the rest
          counters.advanced++;
          continue;
        }

        const tier = pickTier(item, status, haveLocal);
        if (!tier) {
          console.log(`  ${label} — needs cloud, provider unavailable; skipped`);
          continue;
        }
        counters.llmSpent++;

        if (status === 'PENDING') await draftStage(item, tier);
        else if (status === 'DRAFTED') await solveStage(item, tier);
        else await casesStage(item, tier);
        console.log(`  ${label} → advanced (${tier})`);
        counters.advanced++;
      } catch (e: any) {
        if (e instanceof QuotaExhaustedError) {
          console.log(`  ${label} — ${e.message}`);
          console.log('[daemon] provider parked; continuing with remaining work');
          continue;
        }
        counters.failed++;

        // A/B solution disagreement on a generated case → one full regeneration
        // (fresh draft + solutions with the diverging input as context)
        if (status === 'SOLVED' && /disagree/i.test(e.message)) {
          if ((item.payload as any)?.regeneratedOnce) {
            await prisma.contentPipelineItem.update({
              where: { id: item.id },
              data: { status: 'NEEDS_REVIEW', lastError: e.message.slice(0, 500) },
            });
            console.log(`  ${label} — disagreement persisted → NEEDS_REVIEW`);
          } else {
            const fresh = await prisma.contentPipelineItem.findUnique({ where: { id: item.id } });
            await prisma.contentPipelineItem.update({
              where: { id: item.id },
              data: {
                status: 'DRAFTED',
                lastError: e.message.slice(0, 500),
                payload: { ...(fresh?.payload as any), regeneratedOnce: true },
              },
            });
            console.log(`  ${label} — disagreement → regenerating solutions`);
          }
          continue;
        }

        const exhausted = await bumpAttempts(item, status, e.message);
        console.log(`  ${label} — FAIL${exhausted ? ' → NEEDS_REVIEW' : ''}: ${e.message.slice(0, 140)}`);
      }
    }
  }

  // Two concurrent lanes over disjoint resources: the LLM lane owns the GPU
  // (sequential — 4 GB VRAM fits one 8B inference), while seeding + Piston
  // verification (CPU/docker) proceed alongside it.
  const llmLane = async () => {
    for (const s of STAGE_ORDER.filter((s) => s.llm)) await processStage(s.status, true);
  };
  const seedLane = async () => {
    for (const s of STAGE_ORDER.filter((s) => !s.llm)) await processStage(s.status, false);
  };
  await Promise.all([llmLane(), seedLane()]);

  // items the LLM lane pushed to CASES_OK during this run: seed them now
  // instead of leaving them for the next hourly slot
  await processStage('CASES_OK', false);

  const dist = await prisma.contentPipelineItem.groupBy({
    by: ['status'],
    where: { kind: 'coding' },
    _count: true,
  });
  const verified = await prisma.codingProblem.count({ where: { verified: true } });
  console.log(
    `[daemon] done: ${counters.advanced} advanced, ${counters.failed} failed, ${counters.llmSpent}/${BUDGET} LLM budget · ` +
      dist.map((d) => `${d.status}=${d._count}`).join(' ') +
      ` · CodingProblem verified=${verified}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[daemon] fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
