import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

// Seeding technical questions from newfile.txt
// Usage: npx ts-node scripts/seed-technical-mcqs.ts

const SOURCE = 'Technical MCQs — manually curated';

interface ParsedQuestion {
  q: string;
  opts: string[];
  ans: number;
  exp: string;
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function parseSection(content: string, sectionVar: string): ParsedQuestion[] {
  // Find the array definition: sectionVar = [ ... ]
  const startIdx = content.indexOf(`${sectionVar} = [`);
  if (startIdx === -1) {
    console.warn(`Could not find section: ${sectionVar}`);
    return [];
  }

  // Find the closing bracket `]` of the array
  let slice = content.slice(startIdx);
  const endIdx = slice.indexOf(']\n');
  if (endIdx !== -1) {
    slice = slice.slice(0, endIdx + 1);
  }

  const questions: ParsedQuestion[] = [];
  // Match dict(q="...", opts=[...], ans=..., exp="...")
  const dictRegex = /dict\(\s*q\s*=\s*(["'].*?["'])\s*,\s*opts\s*=\s*\[(.*?)\]\s*,\s*ans\s*=\s*(\d+)\s*,\s*exp\s*=\s*(["'].*?["'])\s*\)/gs;
  
  let match;
  while ((match = dictRegex.exec(slice)) !== null) {
    try {
      const qRaw = match[1];
      const optsRaw = match[2];
      const ansRaw = match[3];
      const expRaw = match[4];

      const cleanStr = (s: string) => {
        let val = s.trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        return val.replace(/\\"/g, '"').replace(/\\'/g, "'");
      };

      const q = cleanStr(qRaw);
      const exp = cleanStr(expRaw);
      const ans = parseInt(ansRaw, 10);

      const opts: string[] = [];
      const optRegex = /"(.*?)"|'(.*?)'/g;
      let optMatch;
      while ((optMatch = optRegex.exec(optsRaw)) !== null) {
        opts.push(cleanStr(optMatch[0]));
      }

      if (opts.length !== 4) {
        console.warn(`Skipping question because it does not have exactly 4 options: ${q}`);
        continue;
      }

      questions.push({ q, opts, ans, exp });
    } catch (err: any) {
      console.error(`Error parsing match: ${err.message}`);
    }
  }

  return questions;
}

async function main() {
  const filePath = path.join(__dirname, '..', 'newfile.txt');
  if (!fs.existsSync(filePath)) {
    console.error(`Error: newfile.txt not found at ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const topics = [
    { varName: 'CN', name: 'Computer Networks', slug: 'computer-networks' },
    { varName: 'OS', name: 'Operating Systems', slug: 'operating-systems' },
    { varName: 'DBMS', name: 'Database Management Systems', slug: 'dbms' },
    { varName: 'SQL', name: 'SQL', slug: 'sql' },
  ];

  console.log('Starting ingestion of Technical MCQs...');

  let totalInserted = 0;

  for (const topic of topics) {
    const parsedQuestions = parseSection(content, topic.varName);
    console.log(`Parsed ${parsedQuestions.length} questions for ${topic.name}`);

    if (parsedQuestions.length === 0) {
      continue;
    }

    const t = await prisma.assessmentTopic.upsert({
      where: { slug: topic.slug },
      update: { name: topic.name, category: 'TECHNICAL' as any },
      create: { name: topic.name, slug: topic.slug, category: 'TECHNICAL' as any, order: 100 },
    });

    for (const q of parsedQuestions) {
      const exists = await prisma.assessmentQuestion.findFirst({
        where: {
          topicId: t.id,
          stem: q.q,
        },
      });

      if (exists) {
        continue;
      }

      await prisma.assessmentQuestion.create({
        data: {
          topicId: t.id,
          type: 'SINGLE',
          difficulty: 'MEDIUM',
          stem: q.q,
          explanation: q.exp,
          proposedAnswer: String.fromCharCode(65 + q.ans),
          source: SOURCE,
          verified: true,
          options: {
            create: q.opts.map((optText, index) => ({
              text: optText,
              isCorrect: index === q.ans,
              order: index,
            })),
          },
        },
      });
      totalInserted++;
    }
  }

  console.log(`\nSuccessfully inserted ${totalInserted} new verified questions!`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Seeding script failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
