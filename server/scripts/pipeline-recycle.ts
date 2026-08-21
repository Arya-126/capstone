import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Recycles NEEDS_REVIEW pipeline items whose failure was transient
// (environment/quota/network — not content problems) back into the queue,
// resetting their attempt ladder so local→cloud escalation restarts.
//
// Safe to run anytime; each item is recycled at most 3 times (payload.recycled).
// Items that failed on persistent solution DISAGREEMENT are left for humans.
//
// Usage: npx ts-node scripts/pipeline-recycle.ts

const TRANSIENT = /EACCES|ENOENT|fetch failed|TIMEOUT|timeout|ECONNRESET|quota|unparseable|crash/i;
const HUMAN_ONLY = /disagree/i;

async function main() {
  const items = await prisma.contentPipelineItem.findMany({
    where: { kind: 'coding', status: 'NEEDS_REVIEW' },
  });
  let recycled = 0;
  let kept = 0;
  for (const item of items) {
    const err = item.lastError || '';
    const payload = (item.payload as any) || {};
    const cycles = payload.recycled ?? 0;
    if (HUMAN_ONLY.test(err) || !TRANSIENT.test(err) || cycles >= 3) {
      kept++;
      continue;
    }
    // resume from the deepest completed stage
    const status = payload.cases
      ? 'CASES_OK'
      : payload.solutions
        ? 'SOLVED'
        : payload.draft
          ? 'DRAFTED'
          : 'PENDING';
    delete payload.stageAttempts;
    await prisma.contentPipelineItem.update({
      where: { id: item.id },
      data: {
        status,
        attempts: 0,
        lastError: null,
        payload: { ...payload, recycled: cycles + 1 },
      },
    });
    console.log(`  ${item.key} → ${status} (cycle ${cycles + 1})`);
    recycled++;
  }
  console.log(`recycled ${recycled}, kept for human review ${kept}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('recycle failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
