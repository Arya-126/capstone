import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Piston-free smoke check for reference solutions authored in Python.
// Runs each problem's python reference against its stored test cases using
// the local `python` interpreter. Prints PASS/FAIL per problem.
//
// Filter: --track <slug> or --slug <slug>.
// Doesn't flip verified=true — that still requires the Piston-based verify-dsa.

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const trackFilter = flag('track');
const slugFilter = flag('slug');

function runPython(source: string, input: string, timeoutMs = 8000): { stdout: string; stderr: string; timedOut: boolean } {
  const tmp = path.join(os.tmpdir(), `refsol_${process.pid}_${Date.now()}.py`);
  fs.writeFileSync(tmp, source);
  try {
    const res = spawnSync('python', [tmp], { input, encoding: 'utf8', timeout: timeoutMs });
    return {
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      timedOut: !!res.error && (res.error as any).code === 'ETIMEDOUT',
    };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

async function main() {
  const where: any = { verified: false };
  if (trackFilter) where.track = trackFilter;
  if (slugFilter) where.slug = slugFilter;

  const problems = await prisma.codingProblem.findMany({
    where,
    include: { testCases: true },
    orderBy: [{ track: 'asc' }, { level: 'asc' }, { title: 'asc' }],
  });

  let greenP = 0;
  let redP = 0;
  const failures: { slug: string; case: number; got: string; want: string; stderr: string }[] = [];

  for (const p of problems) {
    const src = (p.referenceSolution as any)?.python;
    if (!src) {
      console.log(`  SKIP  ${p.slug} — no python reference`);
      continue;
    }
    let allOk = true;
    let firstFail: { idx: number; got: string; want: string; stderr: string } | null = null;
    for (let i = 0; i < p.testCases.length; i++) {
      const c = p.testCases[i];
      const res = runPython(src, c.input);
      const got = (res.stdout || '').replace(/\r\n/g, '\n').trimEnd();
      const want = (c.expectedOutput || '').replace(/\r\n/g, '\n').trimEnd();
      if (got !== want) {
        allOk = false;
        firstFail = { idx: i, got, want, stderr: res.stderr.slice(0, 200) };
        break;
      }
    }
    if (allOk) {
      greenP++;
      console.log(`  PASS  ${p.slug} (${p.testCases.length} cases)`);
    } else {
      redP++;
      failures.push({ slug: p.slug, case: firstFail!.idx, got: firstFail!.got, want: firstFail!.want, stderr: firstFail!.stderr });
      console.log(`  FAIL  ${p.slug} — case ${firstFail!.idx}`);
    }
  }

  console.log(`\n${greenP} pass, ${redP} fail`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ${f.slug} · case ${f.case}`);
      console.log(`    want: ${JSON.stringify(f.want)}`);
      console.log(`    got:  ${JSON.stringify(f.got)}`);
      if (f.stderr) console.log(`    err:  ${f.stderr.replace(/\n/g, ' ')}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
