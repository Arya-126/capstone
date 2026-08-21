import { prisma } from '../../src/lib/prisma';
import {
  chat,
  chatJSON,
  Route,
  OLLAMA_CODER,
  OLLAMA_GENERAL,
  OLLAMA_ALT,
} from '../lib/llmClient';
import {
  runPython,
  runPythonAsync,
  mapPool,
  CASE_CONCURRENCY,
  normalizeOutput,
  extractPython,
} from '../lib/localRun';
import { runAgainstCases, runnerAvailable } from '../../src/services/codeRunnerService';

// Coding-bank pipeline stages (docs/content-pipeline-plan.md §A3–A6).
// PENDING → DRAFTED → SOLVED → CASES_OK → SEEDED → VERIFIED
// Every stage is resumable: artifacts accumulate in item.payload, and the
// caller (pipeline-daemon) owns tier selection (local vs cloud) via attempts.

export type Tier = 'local' | 'cloud';

interface Sample {
  input: string;
  output: string;
  explanation?: string;
}
interface Draft {
  statement: string;
  constraints: string;
  topicSlug: string;
  samples: Sample[];
  edgeCaseNotes: string;
}
interface Case {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  weight: number;
  category: string;
}

// served time limit — case generation validates against this exact budget so
// Piston verification (and student solutions) can actually meet it
const TIME_LIMIT_MS = 3000;

const HOUSE_FORMAT = `House rules for problem statements:
- Write an ORIGINAL restatement in your own words (never reproduce copyrighted text).
- Markdown. End with an explicit **Input** and **Output** section describing the exact stdin/stdout protocol.
- stdin protocol: first line sizes/params, following lines the data, all whitespace-separated. No interactive I/O.
- stdout protocol: print exactly the required answer, nothing else. For lists, space-separate on one line unless the problem needs otherwise. For yes/no answers print "YES"/"NO".
- Keep constraints modest: n <= 5000, values |x| <= 10^9 unless the problem inherently needs otherwise. The total stdin of any single test must stay under 50 KB (the sandbox rejects larger payloads). At n=5000 a correct O(n log n) Python solution passes easily while an O(n^2) one exceeds the time limit.
- If the original problem returns indices, state 0-based explicitly.
- The problem must be fully decidable from stdin alone (no ambiguity, exactly one correct output per input).`;

async function codingTopicSlugs(): Promise<string[]> {
  const topics = await prisma.assessmentTopic.findMany({
    where: { category: 'CODING' },
    select: { slug: true },
  });
  return topics.map((t) => t.slug);
}

// ---------- Stage 1: PENDING → DRAFTED ----------

export async function draftStage(item: any, tier: Tier): Promise<void> {
  const meta = item.payload.meta;
  const slugs = await codingTopicSlugs();
  const route: Route = { localModel: OLLAMA_GENERAL, cloud: 'gemini', think: true };

  const system =
    'You are an expert competitive-programming problem setter for an Indian placement-preparation platform. You restate classic interview problems into a precise stdin/stdout format.';
  const user = `Restate the classic interview problem "${meta.title}" (difficulty: ${meta.difficulty}, asked by: ${meta.companies.join(', ')}).

${HOUSE_FORMAT}

Choose the best-fitting topic from exactly this list: ${slugs.join(', ')}

${item.payload.disagreementNote ? `NOTE: a previous draft led to ambiguous behavior on this input — make the statement unambiguous about it:\n${item.payload.disagreementNote}\n` : ''}
If this problem is NOT solvable as an algorithmic stdin/stdout program — e.g. it is a SQL/database problem, a shell problem, a concurrency/multithreading problem, or an interactive/design problem — respond ONLY with {"skip": true, "reason": "<why>"}.

Respond ONLY with a JSON object:
{
  "statement": "<markdown statement with **Input**/**Output** sections>",
  "constraints": "<one line, e.g. 1 <= n <= 10^5, -10^9 <= a[i] <= 10^9>",
  "topicSlug": "<one slug from the list>",
  "samples": [{ "input": "<exact stdin>", "output": "<exact stdout>", "explanation": "<1 sentence>" }, ...2-3 samples],
  "edgeCaseNotes": "<comma-separated tricky scenarios: duplicates, negatives, single element, ties, ...>"
}`;

  const { data, provider, model } = await chatJSON(tier, route, system, user);

  // non-algorithmic problems (SQL, shell, concurrency, design) can't be served
  // by the stdin/stdout runner — park them terminally
  if (data.skip === true) {
    await prisma.contentPipelineItem.update({
      where: { id: item.id },
      data: {
        status: 'SKIPPED',
        lastError: `not stdin/stdout-solvable: ${String(data.reason || '').slice(0, 200)}`,
      },
    });
    return;
  }

  if (
    typeof data.statement !== 'string' ||
    data.statement.length < 80 ||
    !slugs.includes(data.topicSlug) ||
    !Array.isArray(data.samples) ||
    data.samples.length < 2 ||
    data.samples.some((s: any) => typeof s.input !== 'string' || typeof s.output !== 'string')
  ) {
    throw new Error(`draft failed validation (${provider}/${model})`);
  }

  await prisma.contentPipelineItem.update({
    where: { id: item.id },
    data: {
      status: 'DRAFTED',
      payload: {
        ...item.payload,
        draft: {
          statement: data.statement,
          constraints: String(data.constraints || ''),
          topicSlug: data.topicSlug,
          samples: data.samples.slice(0, 3),
          edgeCaseNotes: String(data.edgeCaseNotes || ''),
        },
        stageMeta: { ...(item.payload.stageMeta || {}), draft: `${provider}/${model}` },
      },
    },
  });
}

// ---------- Stage 2: DRAFTED → SOLVED ----------

function solvePrompt(meta: any, draft: Draft, flavor: 'efficient' | 'simple'): string {
  const approach =
    flavor === 'efficient'
      ? 'Write the EFFICIENT intended solution (optimal or near-optimal complexity for the stated constraints).'
      : 'Independently derive a CORRECT solution in the SIMPLEST way you can. Prefer clarity over cleverness, but it must still finish within the constraints for mid-size inputs (n up to ~10^4). Do not worry about the largest inputs.';
  return `Solve this problem in Python 3. ${approach}

# ${meta.title}

${draft.statement}

Constraints: ${draft.constraints}

Rules:
- Read from stdin exactly per the **Input** section; print exactly per the **Output** section. No prompts, no extra output.
- Plain Python 3, standard library only. Use sys.stdin.read() for input.
- Respond with ONLY a single \`\`\`python code block.`;
}

async function generateSolution(
  tier: Tier,
  route: Route,
  meta: any,
  draft: Draft,
  flavor: 'efficient' | 'simple',
  feedback?: string
): Promise<string> {
  const system =
    'You are a competitive programmer. You write correct, self-contained Python 3 solutions that read stdin and write stdout.';
  let user = solvePrompt(meta, draft, flavor);
  if (feedback) user += `\n\nYour previous attempt failed:\n${feedback}\nFix it and return the full corrected program.`;
  const res = await chat(tier, route, system, user);
  const code = extractPython(res.text);
  if (!code) throw new Error(`${flavor} solution: no code block in ${res.provider} reply`);
  return code;
}

// run a solution against the draft samples; returns per-sample outputs or an error string
function runOnSamples(code: string, samples: Sample[]): { outputs?: string[]; error?: string } {
  const outputs: string[] = [];
  for (const s of samples) {
    const r = runPython(code, s.input, 10_000);
    if (!r.ok) return { error: `on sample input ${JSON.stringify(s.input.slice(0, 80))}: ${r.stderr.slice(0, 300)}` };
    outputs.push(normalizeOutput(r.stdout));
  }
  return { outputs };
}

export async function solveStage(item: any, tier: Tier): Promise<void> {
  const meta = item.payload.meta;
  const draft: Draft = item.payload.draft;
  const routeA: Route = { localModel: OLLAMA_CODER, cloud: 'gemini' };
  const routeB: Route = { localModel: OLLAMA_ALT, cloud: 'groq' };

  // solution A (efficient) — retry once with runtime feedback, same tier
  let solA = await generateSolution(tier, routeA, meta, draft, 'efficient');
  let runA = runOnSamples(solA, draft.samples);
  if (runA.error) {
    solA = await generateSolution(tier, routeA, meta, draft, 'efficient', runA.error);
    runA = runOnSamples(solA, draft.samples);
    if (runA.error) throw new Error(`solution A crashes: ${runA.error}`);
  }

  // solution B (independent, simple) — a different model family from A, always
  let solB = await generateSolution(tier, routeB, meta, draft, 'simple');
  let runB = runOnSamples(solB, draft.samples);
  if (runB.error) {
    solB = await generateSolution(tier, routeB, meta, draft, 'simple', runB.error);
    runB = runOnSamples(solB, draft.samples);
    if (runB.error) throw new Error(`solution B crashes: ${runB.error}`);
  }

  // agreement on samples — the draft's claimed outputs are only a soft signal;
  // the two independent solutions are the oracle
  for (let i = 0; i < draft.samples.length; i++) {
    if (runA.outputs![i] !== runB.outputs![i]) {
      throw new Error(
        `A/B disagree on sample ${i}: A=${JSON.stringify(runA.outputs![i].slice(0, 60))} B=${JSON.stringify(runB.outputs![i].slice(0, 60))}`
      );
    }
  }

  // lock sample outputs to the dual-agreed values (fixes any draft slips)
  const samples = draft.samples.map((s, i) => ({ ...s, output: runA.outputs![i] }));

  await prisma.contentPipelineItem.update({
    where: { id: item.id },
    data: {
      status: 'SOLVED',
      payload: {
        ...item.payload,
        draft: { ...draft, samples },
        solutions: { a: solA, b: solB },
        stageMeta: { ...(item.payload.stageMeta || {}), solve: tier },
      },
    },
  });
}

// ---------- Stage 3: SOLVED → CASES_OK ----------

const CASE_PLAN = `Generate exactly 47 test inputs as a JSON array. Category mix (tag each case):
- "min-size": 2 cases — smallest legal input (n=1 or equivalent)
- "boundary": 4 cases — extreme values (max/min of value range, zeros)
- "degenerate": 8 cases — sorted, reverse-sorted, all-equal, heavy duplicates, and structure-specific shapes (skewed tree, single-node list, disconnected graph, ...)
- "adversarial": 5 cases — inputs that break greedy shortcuts, ties, off-by-one traps
- "random-small": 15 cases — random, n <= 20
- "random-medium": 8 cases — random, n around 500-2000
- "performance": 5 cases — n at the constraint maximum (each case's total stdin must stay under 50 KB)`;

export async function casesStage(item: any, tier: Tier): Promise<void> {
  const meta = item.payload.meta;
  const draft: Draft = item.payload.draft;
  const { a: solA, b: solB } = item.payload.solutions;
  const route: Route = { localModel: OLLAMA_CODER, cloud: 'gemini' };

  const system =
    'You write Python 3 test-input generators for programming problems. Your generator must be deterministic (random.seed(42)) and print machine-readable JSON.';
  const user = `Write a Python 3 generator for test inputs of this problem.

# ${meta.title}

${draft.statement}

Constraints: ${draft.constraints}
Known tricky scenarios: ${draft.edgeCaseNotes}

${CASE_PLAN}

Rules:
- Every "input" value must be a COMPLETE stdin payload following the **Input** section exactly (embed newlines as \\n within the JSON strings).
- import random; random.seed(42) at the top — same output every run.
- The program takes no input and prints ONLY: json.dumps(cases) where cases = [{"category": "...", "input": "..."}, ...] with exactly 47 entries.
- Respond with ONLY a single \`\`\`python code block.`;

  const res = await chat(tier, route, system, user);
  const genCode = extractPython(res.text);
  if (!genCode) throw new Error('generator: no code block in reply');

  const genRun = runPython(genCode, '', 60_000);
  if (!genRun.ok) throw new Error(`generator crashed: ${genRun.stderr.slice(0, 300)}`);
  let rawCases: { category: string; input: string }[];
  try {
    rawCases = JSON.parse(genRun.stdout);
  } catch {
    throw new Error('generator printed invalid JSON');
  }
  if (!Array.isArray(rawCases) || rawCases.length < 30) {
    throw new Error(`generator produced ${Array.isArray(rawCases) ? rawCases.length : 'non-array'} cases (need ~47)`);
  }

  // dual-oracle: A defines expected output; B must agree on every
  // non-performance case (B is allowed to be slow, so perf cases are A-only —
  // A itself was cross-checked against B on samples and functional cases).
  const cases: Case[] = draft.samples.map((s) => ({
    input: s.input,
    expectedOutput: s.output,
    isSample: true,
    weight: 1,
    category: 'sample',
  }));

  // filter to unique, servable inputs first
  const seen = new Set(cases.map((c) => c.input));
  const candidates: { category: string; input: string }[] = [];
  for (const rc of rawCases) {
    if (typeof rc?.input !== 'string' || rc.input.trim() === '' || seen.has(rc.input)) continue;
    if (rc.input.length > 60_000) continue; // Piston's JSON body limit — never store unservable cases
    seen.add(rc.input);
    candidates.push({ category: rc.category, input: rc.input });
  }

  // run solution A across CPU cores; the reference must beat the SERVED time
  // limit (×1.5 slack) — a case it can't finish in time is unservable, drop it
  const aRuns = await mapPool(candidates, CASE_CONCURRENCY, (c) =>
    runPythonAsync(solA, c.input, Math.round(TIME_LIMIT_MS * 1.5))
  );
  const survivors: { category: string; input: string; expected: string }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (aRuns[i].timedOut) continue;
    if (!aRuns[i].ok) {
      throw new Error(
        `solution A failed on generated ${candidates[i].category} case: ${aRuns[i].stderr.slice(0, 200)}`
      );
    }
    survivors.push({ ...candidates[i], expected: normalizeOutput(aRuns[i].stdout) });
  }

  // dual-oracle check with solution B on every non-performance survivor
  const functional = survivors.filter((s) => s.category !== 'performance');
  const bRuns = await mapPool(functional, CASE_CONCURRENCY, (s) =>
    runPythonAsync(solB, s.input, 15_000)
  );
  for (let i = 0; i < functional.length; i++) {
    const b = bRuns[i];
    // B timing out on a functional case is tolerated (it may be slow), but a
    // clean run with a different answer is a genuine disagreement →
    // regenerate solutions once with this case as context; second time the
    // item goes to NEEDS_REVIEW (daemon decides)
    if (b.ok && normalizeOutput(b.stdout) !== functional[i].expected) {
      await prisma.contentPipelineItem.update({
        where: { id: item.id },
        data: {
          payload: {
            ...item.payload,
            disagreementNote: `input:\n${functional[i].input.slice(0, 400)}\nsolution A printed: ${functional[i].expected.slice(0, 120)}\nsolution B printed: ${normalizeOutput(b.stdout).slice(0, 120)}`,
          },
        },
      });
      throw new Error(
        `A/B disagree on a ${functional[i].category} case — flagged for solution regeneration`
      );
    }
  }

  for (const s of survivors) {
    if (cases.length >= 50) break;
    cases.push({
      input: s.input,
      expectedOutput: s.expected,
      isSample: false,
      weight: s.category === 'performance' ? 2 : 1,
      category: s.category,
    });
  }

  if (cases.length < 40) throw new Error(`only ${cases.length} usable cases (need >= 40)`);

  // drop any stale disagreement note (undefined keys are not valid JSON values)
  const { disagreementNote: _cleared, ...payloadRest } = item.payload;
  await prisma.contentPipelineItem.update({
    where: { id: item.id },
    data: {
      status: 'CASES_OK',
      payload: {
        ...payloadRest,
        generator: genCode,
        cases,
        stageMeta: { ...(item.payload.stageMeta || {}), cases: tier },
      },
    },
  });
}

// ---------- Stage 4: CASES_OK → SEEDED → VERIFIED ----------

function starters() {
  return {
    python: 'import sys\n\ndata = sys.stdin.read()\n# TODO: parse input from `data` and print your answer\n',
    javascript:
      "const input = require('fs').readFileSync(0, 'utf8');\n// TODO: parse input and console.log your answer\n",
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // TODO: read from stdin, print your answer\n    return 0;\n}\n',
    java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        // TODO: read from stdin, print your answer\n    }\n}\n',
  };
}

export async function seedStage(item: any): Promise<'SEEDED' | 'VERIFIED'> {
  const meta = item.payload.meta;
  const draft: Draft = item.payload.draft;
  const cases: Case[] = item.payload.cases;

  const topic = await prisma.assessmentTopic.findUnique({ where: { slug: draft.topicSlug } });
  if (!topic) throw new Error(`topic ${draft.topicSlug} not found — run seed-dsa.ts first`);

  const level = meta.difficulty === 'EASY' ? 1 : meta.difficulty === 'MEDIUM' ? 2 : 3;
  const data = {
    topicId: topic.id,
    title: meta.title,
    statement: draft.statement,
    difficulty: meta.difficulty,
    constraints: draft.constraints,
    sampleIo: draft.samples.map((s) => ({ input: s.input, output: s.output, explanation: s.explanation })),
    starterCode: starters(),
    referenceSolution: { python: item.payload.solutions.a },
    timeLimitMs: TIME_LIMIT_MS,
    memoryLimitMb: 256,
    source: 'company-wise pipeline (restated)',
    sourceUrl: meta.url,
    companies: meta.companies,
    track: draft.topicSlug,
    level,
    verified: false,
  };

  const problem = await prisma.codingProblem.upsert({
    where: { slug: item.key },
    update: data,
    create: { ...data, slug: item.key },
  });
  await prisma.testCase.deleteMany({ where: { codingProblemId: problem.id } });
  await prisma.testCase.createMany({
    data: cases.map((c) => ({
      codingProblemId: problem.id,
      input: c.input,
      expectedOutput: c.expectedOutput,
      isSample: c.isSample,
      weight: c.weight,
    })),
  });

  // Piston verification — the serving environment must agree with the local
  // runs. If Piston is down, stay SEEDED; the daemon retries next run.
  if (!(await runnerAvailable())) {
    await prisma.contentPipelineItem.update({
      where: { id: item.id },
      data: { status: 'SEEDED' },
    });
    return 'SEEDED';
  }

  const testCases = await prisma.testCase.findMany({ where: { codingProblemId: problem.id } });
  const results = await runAgainstCases(item.payload.solutions.a, 'python', testCases, {
    timeLimitMs: TIME_LIMIT_MS,
    memoryLimitMb: 256,
  });
  const failures = results.filter((r) => !r.passed);

  // Sandboxed Python runs slower than the local interpreter, so borderline
  // performance cases can pass locally yet TLE here. Pure-timeout failures are
  // pruned (the case was too big, not the solution wrong); anything else —
  // Wrong Answer, Runtime Error — is a real correctness failure and hard-fails.
  const realFailures = failures.filter((r) => !/Time\/Memory/i.test(r.status));
  if (realFailures.length > 0) {
    const f = realFailures[0];
    throw new Error(
      `Piston verify: ${results.length - failures.length}/${testCases.length} — case ${f.caseIndex}: ${f.status}`
    );
  }
  if (failures.length > 0) {
    const slowIds = failures.map((r) => testCases[r.caseIndex].id);
    if (testCases.length - slowIds.length < 40) {
      throw new Error(
        `Piston verify: ${failures.length} cases TLE; pruning would leave under 40 cases`
      );
    }
    await prisma.testCase.deleteMany({ where: { id: { in: slowIds } } });
    console.log(`    pruned ${slowIds.length} borderline-slow case(s), ${testCases.length - slowIds.length} remain`);
  }

  await prisma.codingProblem.update({ where: { id: problem.id }, data: { verified: true } });
  await prisma.contentPipelineItem.update({
    where: { id: item.id },
    data: { status: 'VERIFIED' },
  });
  return 'VERIFIED';
}
