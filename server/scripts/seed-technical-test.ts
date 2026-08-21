import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds a practice mock test for the newly ingested Technical Core (CN, OS, DBMS, SQL).
// Usage: npx ts-node scripts/seed-technical-test.ts

const TITLE = 'Technical Core Mock — CS Fundamentals (30 min)';

async function main() {
  const existing = await prisma.assessmentTest.findFirst({ where: { title: TITLE } });
  if (existing) {
    await prisma.attemptResponse.deleteMany({ where: { attempt: { testId: existing.id } } });
    await prisma.proctoringEvent.deleteMany({ where: { attempt: { testId: existing.id } } });
    await prisma.testAttempt.deleteMany({ where: { testId: existing.id } });
    await prisma.testSectionItem.deleteMany({ where: { section: { testId: existing.id } } });
    await prisma.testSection.deleteMany({ where: { testId: existing.id } });
    await prisma.assessmentTest.delete({ where: { id: existing.id } });
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  const test = await prisma.assessmentTest.create({
    data: {
      title: TITLE,
      description: 'Test your understanding of Computer Networks, Operating Systems, DBMS, and SQL with 20 randomized questions.',
      durationMinutes: 30,
      mode: 'PRACTICE',
      randomizeOrder: true,
      negativeMarking: 0.25,
      passScore: 40,
      status: 'PUBLISHED',
      createdById: admin?.id,
      sections: {
        create: [
          {
            title: 'Technical Core (CS)',
            kind: 'MIXED',
            order: 0,
            marksPerQuestion: 1,
            selectionRule: {
              strategy: 'RANDOM',
              category: 'TECHNICAL',
              count: 20,
              verifiedOnly: true, // Only fetch our newly verified questions!
            },
          },
        ],
      },
    },
    include: { sections: true },
  });

  console.log(`Seeded + published: "${test.title}" (ID: ${test.id})`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-technical-test failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
