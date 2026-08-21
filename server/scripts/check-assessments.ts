import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const tests = await prisma.assessmentTest.findMany({
    include: {
      sections: true,
      contest: true
    }
  });

  console.log(`Total tests in DB: ${tests.length}`);
  for (const t of tests) {
    console.log(`- Title: "${t.title}"`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Mode: ${t.mode}`);
    console.log(`  Has Contest: ${t.contest ? 'Yes' : 'No'}`);
    console.log(`  Sections (${t.sections.length}):`);
    for (const s of t.sections) {
      console.log(`    * Section title: "${s.title}" | Kind: ${s.kind} | Rule: ${JSON.stringify(s.selectionRule)}`);
    }
  }

  // Let's also check if there are any available tests for a dummy user
  const availableTests = await prisma.assessmentTest.findMany({
    where: { status: 'PUBLISHED', contest: { is: null } },
    select: {
      id: true,
      title: true,
      sections: true
    }
  });
  console.log(`\nAvailable tests query returned: ${availableTests.length} tests`);
  for (const t of availableTests) {
    console.log(`- "${t.title}"`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
