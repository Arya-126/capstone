import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds a demo cohort + two contests (one LIVE, one UPCOMING) so the Contests
// hub and scoped leaderboards have data immediately. Each contest wraps a fresh
// PUBLISHED AssessmentTest (a 5-question quant sprint from the verified bank).
// Idempotent: reuses contests by slug and refreshes their time windows.

async function ensureContest(
  slug: string,
  title: string,
  opts: { startsAt: Date; endsAt: Date; description: string; cohortId?: string; durationMinutes?: number }
) {
  const existing = await prisma.contest.findUnique({ where: { slug } });
  if (existing) {
    await prisma.contest.update({
      where: { id: existing.id },
      data: { startsAt: opts.startsAt, endsAt: opts.endsAt, settledAt: null },
    });
    return `reused ${slug}`;
  }
  const test = await prisma.assessmentTest.create({
    data: {
      title: `${title} — Test`,
      description: 'Contest test (5 verified quant questions).',
      mode: 'PRACTICE',
      status: 'PUBLISHED',
      durationMinutes: opts.durationMinutes ?? 20,
      negativeMarking: 0,
      sections: {
        create: [
          {
            title: 'Quant Sprint',
            kind: 'APTITUDE',
            order: 0,
            marksPerQuestion: 1,
            selectionRule: { strategy: 'RANDOM', category: 'QUANTITATIVE', count: 5, verifiedOnly: true },
          },
        ],
      },
    },
  });
  await prisma.contest.create({
    data: {
      title,
      slug,
      description: opts.description,
      testId: test.id,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      cohortId: opts.cohortId ?? null,
    },
  });
  return `created ${slug}`;
}

async function main() {
  const cohort = await prisma.cohort.upsert({
    where: { slug: 'demo-college' },
    update: {},
    create: { name: 'Demo College — 2026', slug: 'demo-college', joinCode: 'LEARN26' },
  });
  console.log(`cohort: ${cohort.name} (join code: ${cohort.joinCode})`);

  const now = Date.now();
  const HOUR = 3600 * 1000;
  console.log(
    await ensureContest('weekly-quant-sprint', 'Weekly Quant Sprint', {
      startsAt: new Date(now - HOUR),
      endsAt: new Date(now + 7 * 24 * HOUR),
      description: 'Open to all — 5 quant questions; fastest correct score wins.',
    })
  );
  console.log(
    await ensureContest('campus-aptitude-cup', 'Campus Aptitude Cup', {
      startsAt: new Date(now + 24 * HOUR),
      endsAt: new Date(now + 25 * HOUR),
      description: 'Demo College only — starts tomorrow.',
      cohortId: cohort.id,
    })
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-contests failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
