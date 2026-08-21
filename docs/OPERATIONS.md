# Content Pipeline — Operations Runbook

Self-sufficient guide to running, monitoring, and extending the content pipeline.
Design rationale lives in [content-pipeline-plan.md](content-pipeline-plan.md).
All commands run from `capstone/server/`.

## What exists (as of 2026-07-12)

Two automated pipelines fill the two content banks that proctored mock tests serve:

**A. Coding bank** — 1,286 problems from 31 top India-hiring companies
(LeetCode metadata only; statements are original LLM restatements). Each problem
ships with ~50 dual-oracle-verified test cases, 4-language starters, a verified
Python reference, and company tags. Flow per item:

```
PENDING → DRAFTED → SOLVED → CASES_OK → SEEDED → VERIFIED
 (draft)   (2 solutions) (50 cases)  (DB+Piston)
   qwen3    coder+llama   coder        no LLM
     ↓ after 2 local failures, each stage escalates ↓
   gemini   gemini+groq   gemini
```

A problem is `verified=true` only when two independently generated solutions
agreed on every test output AND the stored data ran green through Piston.

**B. MCQ bank** — 868 aptitude/logical/verbal questions (JV handout extraction).
`solve-and-verify.ts`: Gemini (pass A) + Groq-with-chain-of-thought (pass B)
must agree → `verified=true` + explanation. Disagreements land in the admin
review queue (`/admin/review-queue` in the app).

## Scheduled automation (Windows Task Scheduler)

| Task | Schedule | What it does |
|---|---|---|
| `capstone-content-pipeline` | hourly at :13 | `pipeline-daemon.ts --budget 30` — advances coding items; single-instance locked; parks cloud providers on daily-quota exhaustion (`prisma/data/quota-state.json`) and resumes automatically |
| `capstone-pipeline-recycle` | daily 06:00 | `pipeline-recycle.ts` — returns items that failed for transient reasons (EACCES, network, quota, model crash) back to the queue, max 3 cycles each |

⚠️ Both only run while the laptop is **awake and logged in**. Missed slots do
not catch up. For overnight throughput: Settings → Power → "When plugged in,
put my device to sleep: **Never**", and leave it charging.

## Daily commands

```bash
# the morning dashboard — status counts, bank totals, parked providers, review queue
npx ts-node scripts/pipeline-status.ts

# MCQ verification batch (run 1x/day; sized to Gemini's free daily quota)
npx ts-node scripts/solve-and-verify.ts --limit 100

# manual coding-pipeline run (only if the hourly task is off; the lock prevents overlap)
npx ts-node scripts/pipeline-daemon.ts --budget 30

# recycle transient failures manually
npx ts-node scripts/pipeline-recycle.ts

# tail the logs
tail -50 logs/pipeline.log
tail -20 logs/mcq-solve.log
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `gemini PARKED` in status | daily free quota hit | Nothing — auto-resumes after the reset (~14:00 IST). Local stages keep running. |
| Many `fetch failed` in log | Ollama dropping connections under memory pressure | Client retries 3× automatically; if persistent: `ollama ps`, close RAM-heavy apps, or restart Ollama |
| `spawn python EACCES` | Windows/AV blocking subprocess spawn under Task Scheduler | Recycled automatically by the daily task; if chronic, run the daemon manually from a terminal |
| Items stuck NEEDS_REVIEW with `disagree` | two solutions genuinely disagree — possible ambiguous problem | Human decision: inspect `payload.disagreementNote` in `ContentPipelineItem`, fix or delete the item |
| Daemon exits `another instance is running` | previous run still working (normal) | Nothing. **Never delete `prisma/data/daemon.lock` manually** — stale locks from dead processes are detected automatically |
| Piston down (`SEEDED` items pile up) | docker not running | `docker compose up -d` from `capstone/` |
| `migrate dev` wants to reset DB | migration history has a missing file (`20260518071756_sync_schema`) | **Never accept the reset.** Use `npx prisma db push` for schema changes until history is repaired |

## Key facts (learned the hard way)

- Gemini key has **zero quota for gemini-2.0-flash** — everything uses `gemini-2.5-flash`.
- Piston rejects request bodies over ~100 KB → test-case stdin is capped at 60 KB; constraints target n ≤ 5000.
- Piston's sandboxed Python is slower than local Python → the seed stage prunes cases that fail *only* on time (min 40 cases must survive).
- Groq/llama must NOT be forced into pure-JSON output for math — chain-of-thought first, JSON on the last line (already wired in).
- Local models: qwen3:8b (drafts, thinking on), qwen2.5-coder:7b (solutions/generators), llama3.1:8b (independent second solution). One 8B inference at a time — 4 GB VRAM; do not parallelize Ollama calls.

## Roadmap — what to do next, in order

1. **Keep both pipelines fed daily** (they're autonomous; just keep the laptop awake and run the MCQ batch once a day). Watch `pipeline-status.ts`.
2. **Clear the admin review queue weekly** — MCQ disagreements and coding `disagree` items need a human eye; that's the app's `/admin` review screen for MCQs.
3. **MCQ integrity audit on Ollama** (designed, not built — plan §B1): a local pass over all 868 questions flagging half-displayed/mismatched ones into `assets.audit` so they never get served or burn solver quota. Build `scripts/audit-mcq-ollama.ts` per the plan; run it when the coding queue has thinned (Ollama contention).
4. **New question sources**: use the extraction prompt (see chat / plan doc) on assignment PDFs → JSON → extend `seed-handout.ts` to consume the new `audit`/`answer` fields (~20 lines) → questions arrive pre-audited with proposed answers.
5. **Top-300 list**: when ready, run it through `ingest-company-list.ts` (add the file as another source) — DB-matched rows become tag updates, the rest join the queue.
6. **Repair migration history** (someday, carefully): `prisma migrate diff` to reconstruct the missing migration, so `migrate dev` works again without threatening a reset.
7. **Commit the work**: everything here is uncommitted. `git add capstone/ && git commit` from the repo root (user pushes as brijesh-shetty, no AI attribution).

## What "done" looks like

- **Coding**: ~430 verified problems (everything asked by ≥3 companies) — at
  observed throughput that's several weeks of laptop-awake time; the highest-value
  100 (asked by ≥5 companies) land first by priority order.
- **MCQ**: ~600+ verified of 868 (the rest are image-based or genuinely broken —
  they go to the review queue / stay excluded from serving).
- Every published PROCTORED test resolves all its sections from verified content.
