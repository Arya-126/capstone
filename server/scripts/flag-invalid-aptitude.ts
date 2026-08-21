import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Heuristic scanner for the InterviewQuestion bank. Flags questions likely
// unusable standalone (missing preamble, orphaned entity references, junk
// options). Marks isValid=false + records invalidReason.
//
// Usage:
//   npx tsx scripts/flag-invalid-aptitude.ts          # dry-run: show damage
//   npx tsx scripts/flag-invalid-aptitude.ts --apply  # write to DB
//
// Idempotent: re-running --apply with the same rules produces the same state.
// If the rules change, re-runs may reclassify (invalid → valid or vice
// versa) so any question previously flagged for a reason no longer detected
// will be UN-flagged. This is deliberate — keeps the flag reflective of the
// current ruleset.

interface Rule {
  id: string;
  reason: string;
  test: (q: {
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    optionE: string | null;
  }) => boolean;
}

// Aptitude questions can be legitimately terse (number series "21, 77, ?",
// coding/decoding "MOST", math with labelled quantities "speed of A and B").
// So we ONLY flag the highest-confidence broken patterns — the ones that
// reference an entity that must have been introduced in a preamble the
// seeder dropped.
//
// Confirmed broken form: "Which of the following [...] [of|about|regarding]
// [SINGLE UPPERCASE LETTER]?" — the pronoun-like reference to an entity
// with no other mention of that entity anywhere in the question body.
const ORPHAN_REF_RE = /\b(of|about|regarding|for|by)\s+([A-Z])\s*[?.]/;

const RULES: Rule[] = [
  {
    id: 'orphan-entity',
    reason: 'References unnamed entity (A/B/F/…) without introducing it — likely missing preamble',
    test: (q) => {
      const m = q.question.match(ORPHAN_REF_RE);
      if (!m) return false;
      const entity = m[2];
      // If the entity IS introduced elsewhere in the question (e.g. "A and B",
      // "P is the mother of Q", "point A on line…") don't flag.
      // Count references to the entity as a standalone letter — if it appears
      // more than once, it's probably being introduced somewhere.
      const wordRe = new RegExp(`\\b${entity}\\b`, 'g');
      const occurrences = (q.question.match(wordRe) || []).length;
      if (occurrences > 1) return false;
      return true;
    },
  },
  {
    id: 'refers-to-figure',
    reason: 'References a figure/diagram we cannot render',
    test: (q) =>
      /\b(shown in the figure|see figure|refer to the figure|following figure|below figure)\b/i.test(
        q.question,
      ) && !q.question.match(/\[figure\]|\{figure\}/i),
  },
];

const APPLY = process.argv.includes('--apply');

async function main() {
  const rows = await prisma.interviewQuestion.findMany({
    include: { topic: { include: { category: true } } },
  });
  console.log(`Scanning ${rows.length} questions with ${RULES.length} rules...`);
  console.log(`Mode: ${APPLY ? 'APPLY (writing DB)' : 'DRY-RUN (no writes)'}\n`);

  const flagged: { id: string; question: string; category: string; topic: string; reason: string }[] = [];
  const reasonCounts: Record<string, number> = {};
  const perTopic: Record<string, { total: number; flagged: number; category: string }> = {};

  for (const q of rows) {
    const topicKey = q.topic.name;
    perTopic[topicKey] ||= { total: 0, flagged: 0, category: q.topic.category.name };
    perTopic[topicKey].total++;

    for (const rule of RULES) {
      if (rule.test(q)) {
        flagged.push({
          id: q.id,
          question: q.question.slice(0, 90),
          category: q.topic.category.name,
          topic: q.topic.name,
          reason: rule.id,
        });
        reasonCounts[rule.id] = (reasonCounts[rule.id] || 0) + 1;
        perTopic[topicKey].flagged++;
        break; // one reason per question is enough
      }
    }
  }

  // Reports
  console.log(`=== Reasons ===`);
  for (const [id, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(24)} ${n}`);
  }
  console.log(`  TOTAL FLAGGED             ${flagged.length}\n`);

  console.log(`=== Per-topic damage (worst first) ===`);
  const topicRows = Object.entries(perTopic)
    .map(([topic, s]) => ({ topic, ...s, pct: s.total ? Math.round((s.flagged / s.total) * 100) : 0 }))
    .filter((r) => r.flagged > 0)
    .sort((a, b) => b.pct - a.pct || b.flagged - a.flagged);
  for (const r of topicRows) {
    const bar = '█'.repeat(Math.round(r.pct / 5)).padEnd(20);
    console.log(`  ${r.category.padEnd(20)} ${r.topic.padEnd(30)} ${bar} ${r.flagged}/${r.total} (${r.pct}%)`);
  }

  console.log(`\n=== First 10 flagged samples ===`);
  for (const f of flagged.slice(0, 10)) {
    console.log(`  [${f.reason}] ${f.topic}: "${f.question}${f.question.length >= 90 ? '…' : ''}"`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — re-run with --apply to write these to DB.)`);
    return;
  }

  // First reset all rows to valid — so a rule that no longer detects a
  // previously-flagged question also un-flags it. Then flag the current set.
  const resetResult = await prisma.interviewQuestion.updateMany({
    where: { isValid: false },
    data: { isValid: true, invalidReason: null },
  });
  console.log(`\nReset ${resetResult.count} previously-flagged rows to isValid=true`);

  // Chunk updates so we don't blast Postgres
  let done = 0;
  for (const f of flagged) {
    await prisma.interviewQuestion.update({
      where: { id: f.id },
      data: { isValid: false, invalidReason: f.reason },
    });
    done++;
    if (done % 20 === 0) console.log(`  ...${done}`);
  }
  console.log(`\n✅ Flagged ${done} rows as isValid=false`);

  const valid = await prisma.interviewQuestion.count({ where: { isValid: true } });
  const invalid = await prisma.interviewQuestion.count({ where: { isValid: false } });
  console.log(`Final state: valid=${valid}, invalid=${invalid}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
