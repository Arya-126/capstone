import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

// Morning dashboard for the content pipeline.
// Usage: npx ts-node scripts/pipeline-status.ts

async function main() {
  const dist = await prisma.contentPipelineItem.groupBy({
    by: ['kind', 'status'],
    _count: true,
  });
  const kinds = [...new Set(dist.map((d) => d.kind))];
  console.log('=== content pipeline ===');
  for (const kind of kinds) {
    const parts = dist
      .filter((d) => d.kind === kind)
      .sort((a, b) => b._count - a._count)
      .map((d) => `${d.status}=${d._count}`);
    console.log(`${kind.padEnd(10)} ${parts.join('  ')}`);
  }

  const codingTotal = await prisma.codingProblem.count();
  const codingVerified = await prisma.codingProblem.count({ where: { verified: true } });
  const mcqTotal = await prisma.assessmentQuestion.count();
  const mcqVerified = await prisma.assessmentQuestion.count({ where: { verified: true } });
  console.log('\n=== banks ===');
  console.log(`CodingProblem       ${codingVerified}/${codingTotal} verified`);
  console.log(`AssessmentQuestion  ${mcqVerified}/${mcqTotal} verified`);

  const quotaPath = path.join(__dirname, '..', 'prisma', 'data', 'quota-state.json');
  try {
    const state = JSON.parse(fs.readFileSync(quotaPath, 'utf8'));
    const now = Date.now();
    const parked = Object.entries(state).filter(
      ([, v]: any) => new Date(v.resumeAt).getTime() > now
    );
    if (parked.length) {
      console.log('\n=== parked providers ===');
      for (const [p, v] of parked as any) console.log(`${p}: resumes ${v.resumeAt}`);
    }
  } catch {
    /* no quota state yet */
  }

  const needsReview = await prisma.contentPipelineItem.findMany({
    where: { status: 'NEEDS_REVIEW' },
    select: { key: true, lastError: true },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  });
  if (needsReview.length) {
    console.log('\n=== needs review (latest 10) ===');
    for (const item of needsReview) console.log(`${item.key}: ${item.lastError?.slice(0, 100)}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('pipeline-status failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
