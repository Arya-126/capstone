import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Tier 1 fix for the InterviewQuestion bank: some option strings ended with
// a trailing question-number from the source PDF's next question (e.g.
// "None of these 96" instead of "None of these"). Confirmed via samples in
// Blood Relations / Logical Reasoning.
//
// Pattern: an option ending in "these" (optionally with a period) followed
// by whitespace and an integer. Safe to strip — those digits are never
// legitimate content. Runs across all 4 option columns.
//
// Idempotent: re-running finds nothing to change.

const TRAILING_NUM = /^(.*\bthese\.?)\s+\d+\s*$/i;

function cleanOpt(v: string | null): { cleaned: string | null; changed: boolean } {
  if (!v) return { cleaned: v, changed: false };
  const m = v.match(TRAILING_NUM);
  if (!m) return { cleaned: v, changed: false };
  const cleaned = m[1].trim();
  return { cleaned, changed: cleaned !== v };
}

async function main() {
  const rows = await prisma.interviewQuestion.findMany({
    select: { id: true, optionA: true, optionB: true, optionC: true, optionD: true, optionE: true },
  });
  console.log(`Scanning ${rows.length} questions for trailing-number options...`);

  let touched = 0;
  const samples: any[] = [];
  for (const r of rows) {
    const a = cleanOpt(r.optionA);
    const b = cleanOpt(r.optionB);
    const c = cleanOpt(r.optionC);
    const d = cleanOpt(r.optionD);
    const e = cleanOpt(r.optionE);
    if (!a.changed && !b.changed && !c.changed && !d.changed && !e.changed) continue;

    if (samples.length < 5) {
      samples.push({
        id: r.id.slice(0, 8),
        before: { A: r.optionA, B: r.optionB, C: r.optionC, D: r.optionD, E: r.optionE },
        after: { A: a.cleaned, B: b.cleaned, C: c.cleaned, D: d.cleaned, E: e.cleaned },
      });
    }

    await prisma.interviewQuestion.update({
      where: { id: r.id },
      data: {
        optionA: a.cleaned!,
        optionB: b.cleaned!,
        optionC: c.cleaned!,
        optionD: d.cleaned!,
        optionE: e.cleaned,
      },
    });
    touched++;
  }

  console.log(`\n✅ Cleaned ${touched} rows.`);
  if (samples.length > 0) {
    console.log('\nSample fixes:');
    for (const s of samples) {
      console.log(`  [${s.id}]`);
      for (const k of ['A', 'B', 'C', 'D', 'E'] as const) {
        if (s.before[k] !== s.after[k]) {
          console.log(`    ${k}: "${s.before[k]}" → "${s.after[k]}"`);
        }
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
