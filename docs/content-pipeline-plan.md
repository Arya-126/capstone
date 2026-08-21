# Content Pipeline Plan — Company-wise Coding Bank + Assessment Question Verification

**Goal:** turn the two content banks from "seeded but unusable" into "verified and servable in PROCTORED mocks", with fully resumable automation that runs daily inside free-tier API limits.

**Current state (measured 2026-07-10):**

| Bank                 | Total | Verified | Why it matters                                        |
| -------------------- | ----- | -------- | ----------------------------------------------------- |
| `CodingProblem`      | 14    | 0        | Proctored coding sections resolve to zero items → 400 |
| `AssessmentQuestion` | 868   | 0        | Same for aptitude/logical/verbal sections             |

Existing building blocks this plan reuses (do not rebuild):

- `scripts/generate_dsa_problems.py` — expected outputs are produced by *running* the reference solution, so reference and expectations can never drift.
- `scripts/seed-dsa.ts` / `scripts/seed-company-coding.ts` — upsert-by-slug seeding into `CodingProblem` + `TestCase`.
- `scripts/verify-dsa.ts` — runs the Python reference against every case through Piston; all green → `verified=true`.
- `scripts/solve-and-verify.ts` — dual-LLM agreement solver for MCQs (Gemini+Groq cross-family, or Anthropic ×2), already resumable via `proposedAnswer`.
- `scripts/audit-context.ts` — flags questions whose context/passage was lost in extraction (`assets.audit.status`).
- Admin review queue (`/admin/review-queue`) — human fallback for disagreements.

---

## Part A — Company-wise coding bank (from the GitHub list)

### A0. Legal / content policy

`CodingProblem.statement` is documented as *"our own restated statement, never scraped text"* — keep that rule. We never scrape leetcode.com. What we take from the GitHub list is only **metadata**: title, LeetCode slug/URL, company tags, difficulty, frequency. The LLM then writes an **original restatement** of the (well-known, classic) problem in our stdin/stdout format. `sourceUrl` keeps the attribution link.

### A1. Ingest — `scripts/ingest-company-list.ts`

Input: [snehasishroy/leetcode-companywise-interview-questions](https://github.com/snehasishroy/leetcode-companywise-interview-questions) — 657 company folders, each with recency-window CSVs (`thirty-days`, `three-months`, `six-months`, `all`), columns `ID,URL,Title,Difficulty,Acceptance %,Frequency %`. Snapshot dated 24 May 2026.

**Company selection (measured 2026-07-10):** not all 657 — only top companies that hire in India, in four groups. Per-company counts use `six-months.csv` when it has ≥15 rows, else `all.csv`:

| Group | Companies (repo folder) | Questions |
| ----- | ----------------------- | --------- |
| Already in `Company` table | accenture 142, amazon 665, capgemini 35, cognizant 46, deloitte 41, goldman-sachs 33, infosys 42, jpmorgan 16, microsoft 433, tcs 48, wipro 17, zs-associates 10 | 1,528 |
| Tier-1 tech, big India presence | google 751, adobe 156, oracle 52, walmart-labs 16, uber 71, atlassian 61, salesforce 27, cisco 79, sap 43, samsung 66 | 1,322 |
| Indian product companies | flipkart 109, phonepe 102, zoho 15, paytm 29, swiggy 40, razorpay 12 | 307 |
| Finance | morgan-stanley 55, de-shaw 110, visa 33 | 198 |

Slug mapping: DB `jp-morgan` ↔ repo `jpmorgan`. DB `standard-chartered` has no repo folder — it keeps its company profile but gets no coding tags.

**Deduplicated across all 31 companies: 1,286 unique problems** (346 Easy / 682 Medium / 258 Hard), of which **430 are asked by ≥3 companies**. Sanity check: the most-covered problems (Two Sum ×25, Best Time to Buy and Sell Stock ×26, LRU Cache ×19, …) are exactly the classics an LLM restates reliably.

**Prioritization** — we do *not* generate all 1,286. Queue priority = `(companiesCount × 10) + maxFrequency`, generated in phases:

- **Phase 1 (~100 problems):** every problem asked by ≥5 companies — one wave covers the highest-signal question for *every* selected company at once.
- **Phase 2 (~300):** down to ≥3 companies — this aligns with the planned top-300 list; when that list arrives it merges into the same queue (mostly no-ops by then).
- **Phase 3:** company-specific long tail, on demand per company mock.

1. Clone/download the repo once into `server/prisma/data/company-lists/` (raw files committed or gitignored — decide; raw CSVs are tiny, commit them for reproducibility).
2. Parse every company file → normalize to one row per problem:
   ```ts
   interface ImportRow {
     title: string;          // "Two Sum"
     leetSlug: string;       // "two-sum" (from the URL)
     url: string;
     difficulty: 'EASY' | 'MEDIUM' | 'HARD';
     companies: string[];    // accumulated across files: ["amazon", "google"]
     frequency: number;      // max/sum across companies — used for prioritization
   }
   ```
3. Deduplicate across companies by `leetSlug`, merging `companies[]`. (Note: the current 14 `CodingProblem` rows all have `companies=[]` — the ingest's tag-matching step fixes ~8 of them for free: two-sum, max-subarray, valid-parentheses, number-of-islands, longest-unique-substring, kth-largest, LIS, first-last-position all appear in the top-coverage list.)
4. **Match against existing DB first** (this is the "don't waste time on what we already have" rule):
   - exact `CodingProblem.slug` match, then fuzzy title match (normalized lowercase, stripped punctuation, Levenshtein ≤ 2).
   - Matched → just update `companies` tags + `sourceUrl` on the existing problem. No regeneration.
   - Unmatched → create a `ContentPipelineItem` row (below) with status `PENDING`.
5. Priority order for the queue: `frequency DESC, difficulty ASC` — highest-signal problems get generated first, so even a partial run improves the bank where it matters.

The same ingest script handles the future **top-300 list**: it's just another input file; rows already in the DB become tag-updates, the rest join the queue.

### A2. Pipeline state — new Prisma model

Everything below must survive crashes, rate limits, and machine reboots, so state lives in Postgres, not in script memory:

```prisma
model ContentPipelineItem {
  id        String   @id @default(uuid())
  kind      String   // "coding" | "mcq-audit" | "mcq-solve"
  key       String   // coding: leetSlug; mcq: questionId
  status    String   // PENDING → DRAFTED → SOLVED → CASES_OK → SEEDED → VERIFIED | FAILED | NEEDS_REVIEW
  payload   Json?    // accumulated stage artifacts (statement draft, solutions, generator source)
  priority  Int      @default(0)
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([kind, key])
  @@index([kind, status, priority])
}
```

State transitions are the whole resumability story: every stage reads items in its input status, writes artifacts into `payload`, advances `status`, and commits per item. Kill the script at any point and rerun — nothing is repeated. Items in `VERIFIED` are terminal and never touched again. `attempts >= 3` → `NEEDS_REVIEW` (human looks at `lastError`).

### A3. Stage 1: DRAFT — LLM restates the problem

For each `PENDING` item, one LLM call produces a strict-JSON draft:

```json
{
  "statement": "markdown, original wording, explicit **Input**/**Output** stdin format",
  "constraints": "1 <= n <= 10^5, -10^9 <= a[i] <= 10^9",
  "topicSlug": "arrays",            // one of the 16 existing CODING topic slugs
  "samples": [{ "input": "...", "output": "...", "explanation": "..." }],
  "edgeCaseNotes": "empty-equivalent, all negatives, duplicates, max-n"
}
```

Key points:

- These are classic problems the model knows by name — the prompt passes only `title` + our house format rules, **not** scraped text.
- The statement must define an exact stdin/stdout protocol (like every existing problem) because Piston grading is text-diff based.
- Constraints are chosen by us (cap `n ≤ 10^5`, values `≤ 10^9`) so 50 cases run within `timeLimitMs`.
- Store draft in `payload.draft`, status → `DRAFTED`.

### A4. Stage 2: SOLVE — two independent reference solutions

Same dual-agreement philosophy as `solve-and-verify.ts`, applied to code:

- **Solution A**: LLM pass 1 (e.g. Gemini) writes a Python reference reading the exact stdin format.
- **Solution B**: LLM pass 2 (different family — Groq llama-3.3, or Anthropic if key present) writes an *independent* Python solution; the prompt explicitly asks for a straightforward/brute-force approach when `n` allows, because a dumb-but-correct oracle is the best disagreement detector.
- Both must pass the draft's sample cases locally (plain `python` subprocess — no API cost). Fail → retry once with the error appended, then `FAILED`.
- Store both in `payload.solutions`, status → `SOLVED`.

### A5. Stage 3: CASES — generate 50 test cases with a dual-oracle check

One more LLM call writes a **Python input generator** (`payload.generator`), not the cases themselves — 50 literal cases from an LLM would be low-entropy and error-prone. The generator must emit, tagged by category:

| Category                                         | Count | Notes                                             |
| ------------------------------------------------ | ----- | ------------------------------------------------- |
| samples (from the draft)                         | 2–3   | `isSample=true`, shown in the UI                  |
| minimum size (n=1 / empty-equivalent)            | 2     |                                                   |
| boundary values (min/max of value range, zeros)  | 4     |                                                   |
| degenerate structure (sorted, reversed, all-equal, duplicates; topic-specific: skewed tree, single-node list, disconnected graph) | 8 | |
| adversarial (anti-greedy, tie-breaking, overflow-adjacent sums) | 5 | |
| random small (n ≤ 20)                            | 15    | easy to eyeball when debugging                    |
| random large / performance (n at constraint max) | 3–5   | `weight: 2` — punishes O(n²) where intended       |
| random medium                                    | rest  | to reach 50                                       |

Then, **locally and free**:

1. Run the generator → 50 inputs.
2. Run Solution A and Solution B on every input (subprocess with timeout).
3. **All 50 outputs agree** → expected outputs are locked in, status → `CASES_OK`.
4. Any disagreement → the case inputs + both outputs go into `payload.disagreement`, one automatic regeneration attempt (the prompt shows the diverging case), then `NEEDS_REVIEW`.

This mirrors the guarantee already in `generate_dsa_problems.py` (expectations produced by execution) and strengthens it with a second oracle.

### A6. Stage 4: SEED + VERIFY

- `SEEDED`: upsert into `CodingProblem` (+`TestCase`, ~3 sample / ~47 hidden) by slug, with `companies`, `sourceUrl`, generic 4-language starters (reuse `starters()` from `seed-company-coding.ts`), `referenceSolution.python` = Solution A, `verified=false`. **Do not** copy the wipe-and-reload behavior of `seed-dsa.ts` — that would destroy existing attempts; upsert only.
- `VERIFIED`: run the existing `verify-dsa.ts` logic (Piston) for just-seeded slugs; all green → `CodingProblem.verified=true`, pipeline status → `VERIFIED`.

After the first batch verifies, proctored coding sections start resolving (they already prefer company-tagged problems and fall back to the general pool — `assessmentService.resolveSection`).

---

## Part B — Assessment questions (868, "half displayed / options don't match")

Two distinct problems, two passes:

### B1. Integrity audit (Pass 1) — cheap, high volume → **local LLM (Ollama)**

Before wasting solver quota, every question gets a structural check with strict JSON output:

```json
{ "stemComplete": true, "optionsMatchStem": true, "needsImage": false,
  "optionSetPlausible": true, "reason": "" }
```

- Any failure → write `assets.audit = { status: "BROKEN_<REASON>", by: "ollama/<model>", at: ... }`. The serving filter in `resolveSection` and the solvable filter in `solve-and-verify.ts` **already exclude** items whose `assets.audit.status !== 'SELF_CONTAINED'` — so flagging alone immediately stops broken questions from reaching users or burning solver quota.
- Passing items get `assets.audit.status = "SELF_CONTAINED"`.
- This is exactly the job a local model is good enough for: classification, not correctness. Wrong flags are recoverable (flagged items land in the human review queue, not the trash).

**Ollama setup:** `ollama pull qwen2.5:14b-instruct` (needs ~10–12 GB RAM; on CPU expect ~1–3 q/s slower — still fine overnight for 868×1 calls). Fallback `llama3.1:8b` if RAM-bound. No rate limits, no cost, runs while you sleep.

### B2. Answer verification (Pass 2) — correctness-critical → **cloud dual-model, Ollama as third vote**

Keep the existing `solve-and-verify.ts` agreement rule: *verified only when two independent solvers agree*. Recommended provider mix on free tiers:

- **Pass A: Gemini flash** (free tier, ~1.5k req/day class) — already implemented.
- **Pass B: Ollama qwen2.5:14b** instead of Groq — unlimited, so Groq's small daily token budget is held in reserve.
- **Disagreement → Groq llama-3.3 as tiebreaker** (2-of-3 majority verifies; otherwise human review queue). This is a small extension to `processQuestion()` — add an `ollamaSolve()` sibling to `geminiSolve()` (Ollama's `/api/chat` with `format: "json"` is ~20 lines) and a tiebreak branch.

Honest caveat: a 14B local model is noticeably weaker at multi-step quantitative problems than Gemini/Groq. That's acceptable here *because agreement is required* — a weak second opinion lowers throughput of auto-verification slightly (more tiebreaks) but never lowers correctness. If tiebreak volume gets annoying, flip Pass B back to Groq and use Ollama only for B1.

### B3. Never re-do work (both banks)

- MCQs: already handled — `verified:false` + `proposedAnswer:null` filter skips everything previously attempted; `--redo` overrides. Extend the filter to also skip `assets.audit.status` failures (one line).
- Coding: `ContentPipelineItem.status` is the skip mechanism; `VERIFIED` is terminal.
- Audit: skip questions that already have `assets.audit` (unless `--redo`).

---

## Part C — Daily automation within rate limits

One shared runner, `scripts/pipeline-daemon.ts`, drives both pipelines:

```
npx ts-node scripts/pipeline-daemon.ts [--kind coding|mcq|all] [--budget N]
```

**Loop:** pull next item by `(status, priority)` → run its next stage → commit. Repeat until the queue is empty **or the daily quota is exhausted**.

**Quota handling (the "run until limit, restart when refreshed" requirement):**

- Per-minute 429s (Gemini `retryDelay`, Groq `try again in Ns`) → sleep-and-retry in place. Both patterns already exist in `solve-and-verify.ts`; lift them into a shared `llmClient.ts`.
- **Daily-quota exhaustion** (Gemini returns 429 `RESOURCE_EXHAUSTED` with a day-scale retry, Groq returns a daily-token message) → write `server/prisma/data/quota-state.json`:
  ```json
  { "gemini": { "exhaustedAt": "...", "resumeAt": "..." } }
  ```
  and **exit 0**. Local-only stages (case generation runs, Piston verification, Ollama calls) keep going even when cloud quota is gone — the daemon only parks cloud-dependent stages.
- On startup, if `resumeAt` is in the future for a provider, stages needing that provider are skipped; everything else proceeds.

**Scheduling (Windows):** an *hourly* Task Scheduler job beats a daily one — quota reset times vary by provider (Gemini resets midnight Pacific), and an hourly no-op exit costs nothing:

```powershell
schtasks /Create /TN "capstone-content-pipeline" /SC HOURLY `
  /TR "cmd /c cd /d C:\Users\Lenovo\projects\capstone\capstone\server && npx ts-node scripts/pipeline-daemon.ts --kind all >> logs\pipeline.log 2>&1"
```

The script self-limits: quota parked → exits in <1 s; queue empty → exits; work available → runs until one of those becomes true.

**Monitoring:** `scripts/pipeline-status.ts` prints per-kind counts by status + verified totals — one glance each morning:

```
coding:  PENDING 212 | DRAFTED 18 | SOLVED 9 | CASES_OK 4 | SEEDED 3 | VERIFIED 41 | NEEDS_REVIEW 6
mcq:     audited 868/868 (BROKEN 173) | verified 402 | disagreed 55 | pending 238
```

---

## Rollout order

1. **Migration** — add `ContentPipelineItem` (`npx prisma migrate dev --name content_pipeline`).
2. **Shared LLM client** — extract Gemini/Groq call+retry from `solve-and-verify.ts` into `scripts/lib/llmClient.ts`; add `ollamaSolve`.
3. **B1 audit run** (Ollama, free, overnight) — immediately stops broken MCQs from being served and shrinks the solver queue.
4. **B2 solver** under the daemon — verified MCQs start accumulating day 1; proctored aptitude/verbal/logical sections come alive at roughly ≥15 verified per category (section `count`s are 6–10).
5. **A1 ingest** of the GitHub list (needs the repo URL) — tags existing 14 problems, queues the rest.
6. **A3–A6 coding stages** under the daemon; run `verify-dsa.ts` batch after each seeded wave.
7. **Fix the client error swallowing** ([client/src/services/api.ts:36](../client/src/services/api.ts#L36)) so `{ error }` bodies surface instead of "API error: Bad Request" — 5-line change, do it alongside step 1.
8. Later: feed the **top-300 list** through the same ingest (step 5); DB-matched rows are tag-only updates.

## File inventory (new / changed)

| File                                    | Role                                                         | Status |
| --------------------------------------- | ------------------------------------------------------------ | ------ |
| `ContentPipelineItem` (schema.prisma)   | pipeline state table (applied via `db push` — local migration history was broken) | ✅ |
| `scripts/lib/llmClient.ts`              | Ollama/Gemini/Groq/Anthropic calls, tiered local→cloud routing, per-minute retry, daily-quota park (`quota-state.json`) | ✅ |
| `scripts/lib/localRun.ts`               | local Python subprocess runner + output normalization + code-fence extraction | ✅ |
| `scripts/ingest-company-list.ts`        | GitHub list (31 companies) → dedupe vs DB → queue rows        | ✅ ran: 1,274 queued, 12 tagged |
| `scripts/stages/coding.ts`              | all four stages: draft (qwen3→gemini), solve (qwen2.5-coder + llama3.1 → gemini+groq), cases (dual-oracle 50, served-time-limit validated), seed (upsert + Piston verify with TLE pruning) | ✅ |
| `scripts/pipeline-daemon.ts`            | stage runner: finish-first ordering, budget, single-instance lock, quota parking | ✅ |
| `scripts/pipeline-status.ts`            | morning dashboard                                             | ✅ |
| `client/src/services/api.ts` (modified) | surfaces server `{ error }` messages                          | ✅ |
| Task Scheduler `capstone-content-pipeline` | hourly `pipeline-daemon --budget 30` → `logs/pipeline.log` | ✅ |
| `scripts/audit-mcq-ollama.ts`           | B1 integrity audit (Part B — not started)                     | ⬜ |
| `solve-and-verify.ts` ollama pass B + tiebreak | Part B (model default updated to gemini-2.5-flash)     | ⬜ |

Hard-won operational notes:
- This Gemini key has **zero quota for gemini-2.0-flash** (`limit: 0`) — use `gemini-2.5-flash`.
- Piston's JSON body limit ≈ 100 KB → test-case stdin capped at 60 KB, constraints target n ≤ 5000.
- Piston's sandboxed Python is slower than local Python → seed stage prunes cases that fail *only* on time (min 40 must survive); correctness failures still hard-fail.
