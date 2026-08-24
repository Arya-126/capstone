import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { getOrGenerateBugHunt, getOrGenerateDryRun } from '../src/services/codingGamesService';

// Pre-bake game puzzles from verified CodingProblems into GameContent, so
// on-demand plays hit the cache and don't wait for an LLM call.
//
// Usage:
//   npx tsx scripts/generate-game-content.ts --kind=bug-hunt --count=10
//   npx tsx scripts/generate-game-content.ts --kind=dry-run  --count=10
//   npx tsx scripts/generate-game-content.ts --kind=bug-hunt --count=5 --force
//
// Idempotent: skips problems that already have a puzzle for the given
// gameType, unless --force is passed (then it regenerates fresh alongside).

interface Args {
  kind: 'bug-hunt' | 'dry-run';
  count: number;
  force: boolean;
}

function parseArgs(): Args {
  const args: Args = { kind: 'bug-hunt', count: 5, force: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--kind=')) {
      const v = a.split('=')[1];
      if (v === 'bug-hunt' || v === 'dry-run') args.kind = v;
      else throw new Error(`--kind must be bug-hunt|dry-run (got: ${v})`);
    } else if (a.startsWith('--count=')) {
      args.count = Math.max(1, Math.min(100, parseInt(a.split('=')[1], 10) || 5));
    } else if (a === '--force') {
      args.force = true;
    }
  }
  return args;
}

async function main() {
  const { kind, count, force } = parseArgs();
  const gameType = kind === 'bug-hunt' ? 'BUG_HUNT' : 'DRY_RUN';
  console.log(`🎮 Pre-baking ${count} ${gameType} puzzle(s) — force=${force}`);

  // Prefer verified problems with reference solutions
  const problems = await prisma.codingProblem.findMany({
    where: { verified: true, referenceSolution: { not: null as any } },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
  });
  console.log(`  eligible verified problems: ${problems.length}`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of problems) {
    if (generated >= count) break;

    if (!force) {
      const existing = await prisma.gameContent.findFirst({
        where: { gameType, refId: p.id },
      });
      if (existing) {
        skipped++;
        continue;
      }
    }

    try {
      const puzzle = kind === 'bug-hunt'
        ? await getOrGenerateBugHunt(p.id)
        : await getOrGenerateDryRun(p.id);
      if (puzzle) {
        generated++;
        console.log(`  ✅ [${generated}] ${p.title.slice(0, 60)}`);
      } else {
        failed++;
        console.log(`  ⚠  skipped (no puzzle): ${p.title.slice(0, 60)}`);
      }
    } catch (e: any) {
      failed++;
      console.warn(`  ❌ ${p.title.slice(0, 60)} — ${e?.message || e}`);
    }
  }

  const total = await prisma.gameContent.count({ where: { gameType } });
  console.log(`\nSummary: generated=${generated}, skipped-cached=${skipped}, failed=${failed}`);
  console.log(`${gameType} cache total in DB: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
