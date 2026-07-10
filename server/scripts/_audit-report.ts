import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const questions = await prisma.assessmentQuestion.findMany({
    where: { type: 'SINGLE' },
    select: { assets: true },
  });

  const total = questions.length;
  let requiresImage = 0;
  let incompleteOptions = 0;
  let noAudit = 0;
  const statusCounts: Record<string, number> = {};

  for (const q of questions) {
    const a = (q.assets as any) || {};
    if (a.requiresImage) requiresImage++;
    if (a.incompleteOptions) incompleteOptions++;
    if (a.audit?.status) {
      statusCounts[a.audit.status] = (statusCounts[a.audit.status] || 0) + 1;
    } else if (!a.requiresImage && !a.incompleteOptions) {
      noAudit++;
    }
  }

  console.log(`total SINGLE questions: ${total}`);
  console.log(`requiresImage: ${requiresImage}`);
  console.log(`incompleteOptions: ${incompleteOptions}`);
  console.log(`no audit (excluding image/incomplete): ${noAudit}`);
  console.log(`audit statuses: ${JSON.stringify(statusCounts, null, 2)}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
