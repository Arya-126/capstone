import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { contentAvailability, TheoryInput } from '../src/services/interviewGameContentService';

// Seeds InterviewCategory + InterviewTopic + InterviewTheory from the in-repo
// server/prisma/data/interview_theory.json. Unblocks the "Study with Games"
// entry point on interview topics: the game-content service reads theory
// from these rows to derive game content deterministically.
//
// This is a lean seed on purpose — it does NOT seed InterviewQuestion rows
// (the original design's aptitude MCQ bank now lives in AssessmentQuestion).
// If you want the InterviewQuiz flow to work as well, extend this later.
//
// Idempotent: upserts by slug so re-runs are safe.

const CATEGORIES = [
  { section: 'A', slug: 'quantitative-aptitude', name: 'Quantitative Aptitude', icon: '🔢', description: 'Numerical problem solving.', sortOrder: 1 },
  { section: 'B', slug: 'logical-reasoning', name: 'Logical Reasoning', icon: '🧩', description: 'Patterns, deduction, puzzles.', sortOrder: 2 },
  { section: 'C', slug: 'verbal-ability', name: 'Verbal Ability', icon: '📝', description: 'Grammar, vocabulary, comprehension.', sortOrder: 3 },
];

interface TheoryEntry {
  category: string;
  topic: string;
  slug: string;
  rawTheory: string;
  keyPoints: string[];
  formulas: string[];
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'prisma', 'data', 'interview_theory.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`Missing ${dataPath}`);
    process.exit(1);
  }
  const entries: TheoryEntry[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // 1) Categories
  const categoryIdBySlug: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await prisma.interviewCategory.upsert({
      where: { slug: c.slug },
      update: { section: c.section, name: c.name, icon: c.icon, description: c.description, sortOrder: c.sortOrder },
      create: { section: c.section, slug: c.slug, name: c.name, icon: c.icon, description: c.description, sortOrder: c.sortOrder },
    });
    categoryIdBySlug[c.slug] = row.id;
  }
  console.log(`categories: ${Object.keys(categoryIdBySlug).length} in place`);

  // 2) Topics + theory
  let topicsSeeded = 0;
  let theoryUpserted = 0;
  const availabilityRows: { topic: string; games: string }[] = [];

  const bySlugSort: Record<string, number> = {};
  for (const c of CATEGORIES) bySlugSort[c.slug] = 0;

  for (const e of entries) {
    const catId = categoryIdBySlug[e.category];
    if (!catId) {
      console.warn(`  skip ${e.topic} — unknown category ${e.category}`);
      continue;
    }
    bySlugSort[e.category] = (bySlugSort[e.category] || 0) + 1;

    const topic = await prisma.interviewTopic.upsert({
      where: { categoryId_slug: { categoryId: catId, slug: e.slug } },
      update: { name: e.topic, sortOrder: bySlugSort[e.category] },
      create: { name: e.topic, slug: e.slug, categoryId: catId, sortOrder: bySlugSort[e.category] },
    });
    topicsSeeded++;

    const conceptCount = e.keyPoints.length;
    const formulaCount = e.formulas.length;
    await prisma.interviewTheory.upsert({
      where: { topicId: topic.id },
      update: {
        rawTheory: e.rawTheory,
        keyPoints: e.keyPoints,
        formulas: e.formulas,
        tutorialSections: [
          { heading: 'Introduction', content: e.rawTheory },
          { heading: 'Key Points', content: e.keyPoints },
          { heading: 'Important Formulas', content: e.formulas },
        ],
        formulaCount,
        exampleCount: 0,
        conceptCount,
      },
      create: {
        topicId: topic.id,
        rawTheory: e.rawTheory,
        keyPoints: e.keyPoints,
        formulas: e.formulas,
        tutorialSections: [
          { heading: 'Introduction', content: e.rawTheory },
          { heading: 'Key Points', content: e.keyPoints },
          { heading: 'Important Formulas', content: e.formulas },
        ],
        formulaCount,
        exampleCount: 0,
        conceptCount,
      },
    });
    theoryUpserted++;

    const availability = contentAvailability({
      topicName: e.topic,
      rawTheory: e.rawTheory,
      keyPoints: e.keyPoints,
      formulas: e.formulas,
    } as TheoryInput);
    const compact = Object.entries(availability)
      .map(([g, ok]) => `${g}:${ok ? '✓' : '✗'}`)
      .join(' ');
    availabilityRows.push({ topic: e.topic, games: compact });
  }

  console.log(`\ntopics: ${topicsSeeded} upserted`);
  console.log(`theory: ${theoryUpserted} upserted`);
  console.log(`\ngame availability per topic:`);
  for (const r of availabilityRows) console.log(`  ${r.topic.padEnd(35)} ${r.games}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-interview-theory failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
