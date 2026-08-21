import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Ingests company-wise LeetCode question lists from
// github.com/snehasishroy/leetcode-companywise-interview-questions into the
// content pipeline queue (docs/content-pipeline-plan.md §A1).
//
// Only metadata is taken (title, slug, difficulty, frequency, company tags) —
// statements are restated by the pipeline, never scraped.
//
// - Problems matching an existing CodingProblem get company tags + sourceUrl
//   updated in place (no regeneration).
// - Everything else becomes a ContentPipelineItem(kind="coding") queued by
//   priority = companiesCount*10 + maxFrequency.
//
// Usage: npx ts-node scripts/ingest-company-list.ts [--dry-run]

const BASE =
  'https://raw.githubusercontent.com/snehasishroy/leetcode-companywise-interview-questions/master';

// Selected companies (top India hirers). Repo folder name → company slug we
// store in CodingProblem.companies (matches the Company table where one exists).
const COMPANIES: Record<string, string> = {
  // already in the Company table
  accenture: 'accenture',
  amazon: 'amazon',
  capgemini: 'capgemini',
  cognizant: 'cognizant',
  deloitte: 'deloitte',
  'goldman-sachs': 'goldman-sachs',
  infosys: 'infosys',
  jpmorgan: 'jp-morgan',
  microsoft: 'microsoft',
  tcs: 'tcs',
  wipro: 'wipro',
  'zs-associates': 'zs-associates',
  // tier-1 tech with large India presence
  google: 'google',
  adobe: 'adobe',
  oracle: 'oracle',
  'walmart-labs': 'walmart-labs',
  uber: 'uber',
  atlassian: 'atlassian',
  salesforce: 'salesforce',
  cisco: 'cisco',
  sap: 'sap',
  samsung: 'samsung',
  // Indian product companies
  flipkart: 'flipkart',
  phonepe: 'phonepe',
  zoho: 'zoho',
  paytm: 'paytm',
  swiggy: 'swiggy',
  razorpay: 'razorpay',
  // finance
  'morgan-stanley': 'morgan-stanley',
  'de-shaw': 'de-shaw',
  visa: 'visa',
};

// Existing CodingProblem slugs that are restatements of known LeetCode
// problems — mapped explicitly (titles differ too much for fuzzy matching).
const EXISTING_ALIASES: Record<string, string> = {
  'maximum-subarray': 'max-subarray-sum',
  'two-sum': 'pair-with-target-sum',
  'find-first-and-last-position-of-element-in-sorted-array': 'first-last-position',
  'valid-anagram': 'valid-anagram',
  'reverse-nodes-in-k-group': 'reverse-k-group',
  'n-queens-ii': 'n-queens-count',
  'valid-parentheses': 'valid-parentheses',
  'longest-substring-without-repeating-characters': 'longest-unique-substring',
  'kth-largest-element-in-an-array': 'kth-largest',
  'lowest-common-ancestor-of-a-binary-search-tree': 'bst-lowest-common-ancestor',
  'number-of-islands': 'number-of-islands',
  'longest-increasing-subsequence': 'longest-increasing-subsequence',
  'single-number': 'single-number',
};

// minimal CSV parser (handles quoted fields with commas)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  return rows;
}

async function fetchCsv(company: string, window: string): Promise<string[][] | null> {
  try {
    const res = await fetch(`${BASE}/${company}/${window}.csv`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return parseCsv(await res.text());
  } catch {
    return null;
  }
}

interface Entry {
  title: string;
  url: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  companies: Set<string>;
  maxFreq: number;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const entries = new Map<string, Entry>(); // leetSlug -> entry

  for (const [folder, slug] of Object.entries(COMPANIES)) {
    // six-months is the relevance sweet spot; small companies fall back to all-time
    let rows = await fetchCsv(folder, 'six-months');
    let src = 'six-months';
    if (!rows || rows.length < 16) {
      rows = (await fetchCsv(folder, 'all')) || [];
      src = 'all';
    }
    const dataRows = rows.slice(1); // header: ID,URL,Title,Difficulty,Acceptance %,Frequency %
    for (const r of dataRows) {
      if (r.length < 6) continue;
      const [, url, title, difficulty, , freq] = r;
      const leetSlug = url.replace(/\/+$/, '').split('/').pop();
      if (!leetSlug) continue;
      const diff = difficulty.toUpperCase();
      if (diff !== 'EASY' && diff !== 'MEDIUM' && diff !== 'HARD') continue;
      const e =
        entries.get(leetSlug) ??
        entries
          .set(leetSlug, { title, url, difficulty: diff, companies: new Set(), maxFreq: 0 })
          .get(leetSlug)!;
      e.companies.add(slug);
      const f = parseFloat(freq.replace('%', ''));
      if (!Number.isNaN(f)) e.maxFreq = Math.max(e.maxFreq, f);
    }
    console.log(`${folder.padEnd(16)} ${String(dataRows.length).padStart(4)} rows (${src})`);
  }
  console.log(`\n${entries.size} unique problems across ${Object.keys(COMPANIES).length} companies`);

  // ---- match existing problems: tag-only updates ----
  const existing = await prisma.codingProblem.findMany({ select: { id: true, slug: true } });
  const existingBySlug = new Map(existing.map((p) => [p.slug, p.id]));

  let tagged = 0;
  let queued = 0;
  let updated = 0;
  for (const [leetSlug, e] of entries) {
    const ourSlug = EXISTING_ALIASES[leetSlug] ?? leetSlug;
    const existingId = existingBySlug.get(ourSlug);
    const companies = [...e.companies].sort();

    if (existingId) {
      if (!dryRun) {
        await prisma.codingProblem.update({
          where: { id: existingId },
          data: { companies, sourceUrl: e.url },
        });
        // terminal pipeline row so re-ingest and the daemon both skip it
        await prisma.contentPipelineItem.upsert({
          where: { kind_key: { kind: 'coding', key: leetSlug } },
          update: { status: 'VERIFIED', payload: { matchedExisting: ourSlug, companies } },
          create: {
            kind: 'coding',
            key: leetSlug,
            status: 'VERIFIED',
            payload: { matchedExisting: ourSlug, companies },
          },
        });
      }
      tagged++;
      continue;
    }

    const priority = Math.round(e.companies.size * 10 + e.maxFreq);
    const meta = {
      title: e.title,
      url: e.url,
      difficulty: e.difficulty,
      companies,
      maxFreq: e.maxFreq,
    };
    if (!dryRun) {
      const res = await prisma.contentPipelineItem.upsert({
        where: { kind_key: { kind: 'coding', key: leetSlug } },
        // refresh priority but never regress the status of an item that's
        // already moving through the pipeline (meta is merged below)
        update: { priority },
        create: { kind: 'coding', key: leetSlug, status: 'PENDING', priority, payload: { meta } },
      });
      // merge meta into payload without clobbering stage artifacts
      const payload = (res.payload as any) || {};
      await prisma.contentPipelineItem.update({
        where: { id: res.id },
        data: { payload: { ...payload, meta } },
      });
      if (res.status === 'PENDING') queued++;
      else updated++;
    } else queued++;
  }

  console.log(`\n${tagged} matched existing problems (tags updated)`);
  console.log(`${queued} queued as PENDING, ${updated} in-flight items refreshed`);

  const dist = await prisma.contentPipelineItem.groupBy({
    by: ['status'],
    where: { kind: 'coding' },
    _count: true,
  });
  console.log('pipeline status:', dist.map((d) => `${d.status}=${d._count}`).join(' '));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('ingest failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
