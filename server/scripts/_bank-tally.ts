import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const total = await prisma.codingProblem.count();
  const verified = await prisma.codingProblem.count({ where: { verified: true } });
  const byTrack = await prisma.codingProblem.groupBy({
    by: ['track'],
    _count: { _all: true },
    orderBy: { track: 'asc' },
  });
  console.log(`total: ${total}  verified: ${verified}  unverified: ${total - verified}`);
  console.log(`by track:`);
  for (const t of byTrack) console.log(`  ${t.track ?? '(none)'}: ${t._count._all}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
