import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

(async () => {
  const count = await prisma.interviewTopic.count();
  console.log('InterviewTopic count =', count);
  const all = await prisma.interviewTopic.findMany({ include: { theory: true } });
  console.log('with theory =', all.filter((t) => t.theory).length);
  const withF = all.find(
    (t) => t.theory && Array.isArray(t.theory.formulas as any) && (t.theory.formulas as any).length > 3
  );
  if (withF && withF.theory) {
    console.log('=== sample topic:', withF.name, '===');
    console.log('keyPoints (first 5):');
    for (const k of (withF.theory.keyPoints as any).slice(0, 5)) console.log('  •', k);
    console.log('formulas (first 8):');
    for (const f of (withF.theory.formulas as any).slice(0, 8)) console.log('  ~', f);
    console.log('rawTheory head:', withF.theory.rawTheory.slice(0, 300));
  } else if (all[0]?.theory) {
    console.log('=== fallback topic:', all[0].name, '===');
    console.log('keyPoints:', JSON.stringify((all[0].theory.keyPoints as any).slice(0, 5), null, 2));
    console.log('formulas:', JSON.stringify((all[0].theory.formulas as any).slice(0, 5), null, 2));
  }
  await prisma.$disconnect();
})();
