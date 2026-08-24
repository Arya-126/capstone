import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('📦 Exporting database questions...');

  const coding = await prisma.codingProblem.findMany({ include: { testCases: true } });
  const core = await prisma.coreSubjectQuestion.findMany();
  const hr = await prisma.hrQuestion.findMany();
  const assessment = await prisma.assessmentQuestion.findMany();
  const interview = await prisma.interviewQuestion.findMany();

  const exportPayload = {
    meta: {
      exportedAt: new Date().toISOString(),
      counts: {
        codingProblems: coding.length,
        coreSubjectQuestions: core.length,
        hrQuestions: hr.length,
        assessmentQuestions: assessment.length,
        interviewQuestions: interview.length,
      },
    },
    codingProblems: coding,
    coreSubjectQuestions: core,
    hrQuestions: hr,
    assessmentQuestions: assessment,
    interviewQuestions: interview,
  };

  const outputPath = path.join(__dirname, '..', 'exported_questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2));

  console.log('✅ Export complete!');
  console.log(`📄 Saved to: ${outputPath}`);
  console.log('Summary:', exportPayload.meta.counts);
}

main()
  .catch((e) => {
    console.error('Export failed:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
