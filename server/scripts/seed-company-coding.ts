import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds a bank of COMPANY-TAGGED coding problems — each with a full description,
// constraints, sample I/O, 4-language starter code, a Python reference solution,
// and both SAMPLE and HIDDEN test cases.
//
// Problems are tagged with company slugs (CodingProblem.companies). The company
// pattern engine's CODING rounds prefer problems tagged for that company and
// fall back to the general pool (see assessmentService.resolveSection).
//
// Like the DSA bank, problems land verified=false. After this, start the Piston
// sandbox (docker compose up -d) and run scripts/verify-dsa.ts to execute every
// Python reference against its cases and flip the passing ones verified=true
// (only verified problems are served in PROCTORED company mocks).
//
// Idempotent: re-running upserts by slug and refreshes each problem's test cases.

// Generic per-language starter skeletons (candidate fills in the logic).
function starters() {
  return {
    python: 'import sys\n\ndata = sys.stdin.read()\n# TODO: parse input from `data` and print your answer\n',
    javascript:
      "const input = require('fs').readFileSync(0, 'utf8');\n// TODO: parse input and console.log your answer\n",
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // TODO: read from stdin, print your answer\n    return 0;\n}\n',
    java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        // TODO: read from stdin, print your answer\n    }\n}\n',
  };
}

interface CaseDef {
  input: string;
  expectedOutput: string;
  isSample: boolean;
}
interface ProblemDef {
  topicSlug: string;
  title: string;
  slug: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  statement: string;
  constraints: string;
  companies: string[];
  reference: string; // python
  cases: CaseDef[];
}

const PROBLEMS: ProblemDef[] = [
  {
    topicSlug: 'arrays',
    title: 'Two Sum',
    slug: 'two-sum-indices',
    difficulty: 'EASY',
    companies: ['amazon', 'microsoft', 'goldman-sachs'],
    statement:
      'Given an array of integers and a target, return the indices (0-based) of the two numbers that add up to the target. Exactly one solution exists; output the two indices in increasing order, space-separated.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers; line 3 = `target`.\n**Output**: two 0-based indices, space-separated.',
    constraints: '2 <= n <= 10^5, -10^9 <= a[i], target <= 10^9. Exactly one valid pair.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n])); t = int(d[1+n])\nseen = {}\nfor i, x in enumerate(a):\n    if t - x in seen:\n        print(seen[t - x], i); break\n    seen[x] = i\n',
    cases: [
      { input: '4\n2 7 11 15\n9', expectedOutput: '0 1', isSample: true },
      { input: '3\n3 2 4\n6', expectedOutput: '1 2', isSample: true },
      { input: '2\n3 3\n6', expectedOutput: '0 1', isSample: false },
      { input: '5\n-1 -2 -3 -4 -5\n-8', expectedOutput: '2 4', isSample: false },
      { input: '6\n1 5 3 7 9 2\n11', expectedOutput: '4 5', isSample: false },
    ],
  },
  {
    topicSlug: 'strings',
    title: 'Reverse Words',
    slug: 'reverse-words',
    difficulty: 'EASY',
    companies: ['tcs', 'infosys', 'cognizant', 'wipro', 'standard-chartered'],
    statement:
      'Given a sentence, reverse the order of its words. Collapse any run of spaces to a single space and ignore leading/trailing spaces.\n\n**Input**: one line of text.\n**Output**: the words in reverse order, single-spaced.',
    constraints: '1 <= length <= 10^4.',
    reference: "import sys\nline = sys.stdin.read().strip()\nprint(' '.join(line.split()[::-1]))\n",
    cases: [
      { input: 'the sky is blue', expectedOutput: 'blue is sky the', isSample: true },
      { input: 'hello world', expectedOutput: 'world hello', isSample: true },
      { input: 'a b c d e', expectedOutput: 'e d c b a', isSample: false },
      { input: 'single', expectedOutput: 'single', isSample: false },
      { input: '  leading and trailing  ', expectedOutput: 'trailing and leading', isSample: false },
    ],
  },
  {
    topicSlug: 'arrays',
    title: 'FizzBuzz',
    slug: 'fizzbuzz-n',
    difficulty: 'EASY',
    companies: ['tcs', 'infosys', 'accenture', 'capgemini'],
    statement:
      'Print the numbers from 1 to n, one per line, but print "Fizz" for multiples of 3, "Buzz" for multiples of 5, and "FizzBuzz" for multiples of both.\n\n**Input**: a single integer `n`.\n**Output**: `n` lines.',
    constraints: '1 <= n <= 10^4.',
    reference:
      'import sys\nn = int(sys.stdin.read().split()[0])\nout = []\nfor i in range(1, n + 1):\n    if i % 15 == 0: out.append("FizzBuzz")\n    elif i % 3 == 0: out.append("Fizz")\n    elif i % 5 == 0: out.append("Buzz")\n    else: out.append(str(i))\nprint("\\n".join(out))\n',
    cases: [
      { input: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz', isSample: true },
      { input: '3', expectedOutput: '1\n2\nFizz', isSample: true },
      {
        input: '15',
        expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz',
        isSample: false,
      },
      { input: '1', expectedOutput: '1', isSample: false },
      {
        input: '20',
        expectedOutput:
          '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n16\n17\nFizz\n19\nBuzz',
        isSample: false,
      },
    ],
  },
  {
    topicSlug: 'arrays',
    title: 'Second Largest',
    slug: 'second-largest',
    difficulty: 'EASY',
    companies: ['wipro', 'capgemini', 'cognizant'],
    statement:
      'Find the second largest DISTINCT value in an array. If it does not exist (all elements equal, or only one element), print -1.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers.\n**Output**: the second largest distinct value, or -1.',
    constraints: '1 <= n <= 10^5, -10^9 <= a[i] <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nu = sorted(set(a), reverse=True)\nprint(u[1] if len(u) >= 2 else -1)\n',
    cases: [
      { input: '6\n12 35 1 10 34 1', expectedOutput: '34', isSample: true },
      { input: '2\n10 10', expectedOutput: '-1', isSample: true },
      { input: '5\n5 4 3 2 1', expectedOutput: '4', isSample: false },
      { input: '3\n7 7 8', expectedOutput: '7', isSample: false },
      { input: '1\n100', expectedOutput: '-1', isSample: false },
    ],
  },
  {
    topicSlug: 'stacks-queues',
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    difficulty: 'MEDIUM',
    companies: ['amazon', 'microsoft', 'goldman-sachs'],
    statement:
      'Given a string containing the characters ()[]{} only, decide whether the brackets are balanced and correctly nested.\n\n**Input**: one line — the bracket string.\n**Output**: "YES" if balanced, otherwise "NO".',
    constraints: '1 <= length <= 10^4.',
    reference:
      'import sys\ns = sys.stdin.read().strip()\nst = []\nm = {")": "(", "]": "[", "}": "{"}\nok = True\nfor c in s:\n    if c in "([{":\n        st.append(c)\n    elif c in m:\n        if not st or st.pop() != m[c]:\n            ok = False; break\nprint("YES" if ok and not st else "NO")\n',
    cases: [
      { input: '()[]{}', expectedOutput: 'YES', isSample: true },
      { input: '(]', expectedOutput: 'NO', isSample: true },
      { input: '([)]', expectedOutput: 'NO', isSample: false },
      { input: '{[]}', expectedOutput: 'YES', isSample: false },
      { input: '(((', expectedOutput: 'NO', isSample: false },
      { input: '((()))', expectedOutput: 'YES', isSample: false },
    ],
  },
  {
    topicSlug: 'greedy',
    title: 'Merge Intervals',
    slug: 'merge-intervals',
    difficulty: 'MEDIUM',
    companies: ['amazon', 'microsoft'],
    statement:
      'Given a set of intervals, merge all overlapping intervals and output them sorted by start. Intervals that touch at an endpoint (e.g. [1,4] and [4,5]) are considered overlapping.\n\n**Input**: line 1 = `n`; next `n` lines each have two integers `l r`.\n**Output**: the merged intervals, one `l r` per line, sorted by start.',
    constraints: '1 <= n <= 10^5, -10^9 <= l <= r <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nidx = 0\nn = int(d[idx]); idx += 1\niv = []\nfor _ in range(n):\n    l = int(d[idx]); r = int(d[idx + 1]); idx += 2\n    iv.append((l, r))\niv.sort()\nres = []\nfor l, r in iv:\n    if res and l <= res[-1][1]:\n        res[-1] = (res[-1][0], max(res[-1][1], r))\n    else:\n        res.append((l, r))\nprint("\\n".join(f"{l} {r}" for l, r in res))\n',
    cases: [
      { input: '4\n1 3\n2 6\n8 10\n15 18', expectedOutput: '1 6\n8 10\n15 18', isSample: true },
      { input: '2\n1 4\n4 5', expectedOutput: '1 5', isSample: true },
      { input: '1\n5 7', expectedOutput: '5 7', isSample: false },
      { input: '3\n1 4\n0 4\n3 5', expectedOutput: '0 5', isSample: false },
      { input: '3\n1 2\n3 4\n5 6', expectedOutput: '1 2\n3 4\n5 6', isSample: false },
    ],
  },
  {
    topicSlug: 'arrays',
    title: 'Best Time to Buy and Sell Stock',
    slug: 'max-profit-stock',
    difficulty: 'MEDIUM',
    companies: ['amazon', 'goldman-sachs', 'jp-morgan', 'standard-chartered'],
    statement:
      'You are given daily prices of a stock. Maximize the profit from a single buy followed by a later sell. If no profit is possible, output 0.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated prices.\n**Output**: the maximum profit.',
    constraints: '1 <= n <= 10^5, 0 <= price <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nmn = a[0]; best = 0\nfor x in a[1:]:\n    best = max(best, x - mn)\n    mn = min(mn, x)\nprint(best)\n',
    cases: [
      { input: '6\n7 1 5 3 6 4', expectedOutput: '5', isSample: true },
      { input: '5\n7 6 4 3 1', expectedOutput: '0', isSample: true },
      { input: '3\n2 4 1', expectedOutput: '2', isSample: false },
      { input: '1\n5', expectedOutput: '0', isSample: false },
      { input: '6\n3 2 6 5 0 3', expectedOutput: '4', isSample: false },
    ],
  },
  {
    topicSlug: 'strings',
    title: 'Anagram Check',
    slug: 'anagram-check',
    difficulty: 'EASY',
    companies: ['tcs', 'infosys', 'accenture', 'deloitte'],
    statement:
      'Given two strings, decide whether they are anagrams of each other, ignoring case and spaces.\n\n**Input**: two lines — the two strings.\n**Output**: "YES" if they are anagrams, otherwise "NO".',
    constraints: '1 <= length <= 10^4.',
    reference:
      'import sys\nlines = sys.stdin.read().split("\\n")\na = lines[0].strip().replace(" ", "").lower()\nb = (lines[1].strip().replace(" ", "").lower()) if len(lines) > 1 else ""\nprint("YES" if sorted(a) == sorted(b) else "NO")\n',
    cases: [
      { input: 'listen\nsilent', expectedOutput: 'YES', isSample: true },
      { input: 'hello\nworld', expectedOutput: 'NO', isSample: true },
      { input: 'Dormitory\nDirty Room', expectedOutput: 'YES', isSample: false },
      { input: 'abc\ncab', expectedOutput: 'YES', isSample: false },
      { input: 'abc\nabcd', expectedOutput: 'NO', isSample: false },
    ],
  },
  {
    topicSlug: 'bit-manipulation',
    title: 'Power of Two',
    slug: 'power-of-two',
    difficulty: 'EASY',
    companies: ['zs-associates', 'deloitte', 'goldman-sachs'],
    statement:
      'Determine whether a given integer is a power of two.\n\n**Input**: a single integer `n`.\n**Output**: "YES" if `n` is a power of two, otherwise "NO".',
    constraints: '0 <= n <= 2^31 - 1.',
    reference:
      'import sys\nn = int(sys.stdin.read().split()[0])\nprint("YES" if n > 0 and (n & (n - 1)) == 0 else "NO")\n',
    cases: [
      { input: '16', expectedOutput: 'YES', isSample: true },
      { input: '18', expectedOutput: 'NO', isSample: true },
      { input: '1', expectedOutput: 'YES', isSample: false },
      { input: '1024', expectedOutput: 'YES', isSample: false },
      { input: '0', expectedOutput: 'NO', isSample: false },
      { input: '12', expectedOutput: 'NO', isSample: false },
    ],
  },
];

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  // ensure coding topics exist
  const topicSlugs = [...new Set(PROBLEMS.map((p) => p.topicSlug))];
  for (const slug of topicSlugs) {
    await prisma.assessmentTopic.upsert({
      where: { slug },
      update: {},
      create: { name: titleCase(slug), slug, category: 'CODING' },
    });
  }
  const topics = await prisma.assessmentTopic.findMany({
    where: { slug: { in: topicSlugs } },
    select: { id: true, slug: true },
  });
  const topicId = Object.fromEntries(topics.map((t) => [t.slug, t.id]));

  const starter = starters();
  let created = 0;
  let updated = 0;
  let totalCases = 0;

  for (const p of PROBLEMS) {
    const sampleIo = p.cases
      .filter((c) => c.isSample)
      .map((c) => ({ input: c.input, output: c.expectedOutput }));
    const common = {
      topicId: topicId[p.topicSlug],
      title: p.title,
      statement: p.statement,
      difficulty: p.difficulty as any,
      constraints: p.constraints,
      sampleIo: sampleIo as any,
      starterCode: starter as any,
      referenceSolution: { python: p.reference } as any,
      companies: p.companies,
      source: 'LearnHub company set',
      verified: false,
    };
    const caseCreate = p.cases.map((c) => ({
      input: c.input,
      expectedOutput: c.expectedOutput,
      isSample: c.isSample,
      weight: 1,
    }));

    const existing = await prisma.codingProblem.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (existing) {
      await prisma.testCase.deleteMany({ where: { codingProblemId: existing.id } });
      await prisma.codingProblem.update({
        where: { id: existing.id },
        data: { ...common, testCases: { create: caseCreate } },
      });
      updated++;
    } else {
      await prisma.codingProblem.create({
        data: { ...common, slug: p.slug, testCases: { create: caseCreate } },
      });
      created++;
    }
    totalCases += p.cases.length;
  }

  console.log(
    `Company coding bank: ${created} created, ${updated} updated, ${totalCases} test cases (verified=false).`
  );
  console.log('Next: docker compose up -d  (start Piston), then: npx ts-node scripts/verify-dsa.ts');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-company-coding failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
