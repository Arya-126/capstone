# Implementation Status

Snapshot of what has actually landed. Verify with `git status` / `git log` — this doc drifts.

**Last updated:** current shipping session — comprehensive reports + 7 prep games + pipeline closed-loop.

---

## The closed loop (what the app actually does now)

Fresh account →
1. **Diagnostic** (21 mixed Qs, ~15 min) → per-pillar levels (1-5) + belt (Bronze→Diamond) → `UserSkillProfile`
2. **Auto-generated pipeline** → up to 15 gated stages, first unlocked
3. Take **any** quiz / mock / coding round → auto-scoring + **TestReport** with per-mistake explanation and concept tagging
4. Report page shows **weak concepts + AI-generated synopses + game recommendations**
5. One click on report → new stages injected into active pipeline (dedup handled), each stage carries the synopsis bullet as a study cue
6. Play the reinforcing quiz / game / mock → **gate fires** → stage completes → next unlocks
7. Achievements + belt + XP update along the way

---

## Sprints — original interview expansion plan

| Sprint | Scope | Status |
|--------|-------|--------|
| 1 — HR round + data seeding | HrQuestion seeded (158), prompts, roundType | ✅ |
| 2 — Resume-aware technical | resumeService + technical-interviewer.md + pdf-parse v2 fix + CoreSubjectQuestion (231) | ✅ |
| 3 — Coding interview room | CodingInterviewRoom rewrite: fullscreen, Monaco, Run/Submit split, consent gate | ✅ |
| 4 — Diagnosis + quest system | InterviewDiagnosis, UserQuest, diagnosisService | ✅ |
| 5 — Full drive + prep tracker | PrepTrackerDashboard, PlacementDriveWizard, CoreCsHub | ✅ |
| 6 — Gamification + polish | Interview XP rules, 16 interview + 9 pipeline achievements, recommendationService | ✅ |

## Sprints — personalized learning pipeline addendum

| Sprint | Scope | Status |
|--------|-------|--------|
| A — Diagnostic backend | UserSkillProfile / DiagnosticAttempt / LearningPipeline / PipelineStage; diagnosticService | ✅ |
| B — Diagnostic UI + login gate | DiagnosticIntro / Test / Result; post-login profile check → intro or pipeline | ✅ |
| C — Pipeline generator + gates | generateStages + checkPipelineGates; hooks in quiz/coding/interview handlers; PipelinePage | ✅ |
| D — Belts + achievements | 9 pipeline achievements + belt ladder + condition types; achievement events fired | ✅ |

## Sprints — comprehensive reports + gamified reinforcement (this session)

| Sprint | Scope | Status |
|--------|-------|--------|
| 1 — TestReport + ConceptSynopsis + wiring | schema + services + prompt + shared UI + post-quiz wire | ✅ |
| 2 — 3 easy-win games | Complexity Sort, Time Rush, STAR Roleplay | ✅ |
| 3 — LLM-generated coding games | Bug Hunt, Dry-Run + batch generator | ✅ |
| 4 — SQL + Diagram games | SQL Puzzle (sql.js), Diagram Labeler (OSI, TCP, ER) | ✅ |
| 5 — Pipeline closed loop | Inject stages from a report; embed synopsis on stage cards | ✅ |

---

## Bug fixes / hardening this session

| Fix | Status |
|-----|--------|
| pdf-parse v1→v2 API migration — resume upload was silently failing ("Could not extract text") | ✅ |
| Interviewer dumped raw model output as "spoken" turn when JSON parse failed → 2000-word markdown treatises as questions | ✅ |
| All 3 interviewer prompts hardened — explicit "NEVER answer for the candidate", no Markdown, 60-word cap | ✅ |
| Fullscreen bleed-through — `coding-interview-room` and `diagnostic-test` now truly own the viewport | ✅ |
| Skipped pipeline stage was marked `isCompleted: true` (looked "done") → new `isSkipped` field + amber "Missed" section + "Complete now" CTA | ✅ |
| Aptitude bank scrubbed — 5 rows with garbled trailing digits fixed; 5 orphaned-entity questions flagged `isValid: false`; read paths filter | ✅ |
| Rebase resolved conflict in schema.prisma (Company relations) with upstream/main | ✅ |

---

## The 7 prep games

Accessible at `/prep-games` in the app.

| # | Game | Reinforces | Data | Notes |
|---|------|-----------|------|-------|
| 1 | **Complexity Sort** | Big-O intuition | 20 seeded algo→complexity pairs (inline) | Pure client, no server calls |
| 2 | **Time Rush** | Recall speed on any topic | Derived from `InterviewTheory.keyPoints` (7 usable topics) | 60-second flashcard sprint |
| 3 | **STAR Roleplay** | HR round instincts | LLM-generated 4-answer sets from `HrQuestion`, cached in `GameContent` | 1 strong STAR + 3 differently-weak decoys |
| 4 | **Bug Hunt** | Code review + debugging | LLM-generated bug variants of `CodingProblem` reference solutions | Click-a-line UI; per-bug reveals on check |
| 5 | **Dry-Run** | Mental execution | LLM-generated snippet + expected stdout from `CodingProblem` | Whitespace-normalized comparison |
| 6 | **SQL Puzzle** | Query fluency | 8 seeded puzzles (easy/medium/hard) | sql.js dynamic-import (~1MB WASM), Monaco editor |
| 7 | **Diagram Labeler** | CN/DBMS visual intuition | 3 seeded SVG diagrams (OSI, TCP handshake, ER) | Tap-to-select then tap-to-place |

**Warming the LLM-generated caches** (Bug Hunt + Dry-Run + STAR Roleplay):
```bash
cd capstone/server
npx tsx scripts/generate-game-content.ts --kind=bug-hunt --count=15
npx tsx scripts/generate-game-content.ts --kind=dry-run  --count=15
```

Idempotent — skips problems already cached. STAR Roleplay warms itself on first play (~2s LLM call, cached forever).

---

## Data snapshot

| Table | Rows | Notes |
|-------|------|-------|
| `InterviewCategory` | 3 | Quant / Logical / Verbal |
| `InterviewTopic` | 32 | |
| `InterviewQuestion` | 470 total (465 valid, 5 flagged) | Aptitude bank cleanup ran |
| `InterviewTheory` | 32 (7 with ≥4 key points, usable by Time Rush) | |
| `CoreSubjectQuestion` | 231 (CN 62 / OS 59 / DBMS 58 / SQL 52) | |
| `CodingProblem` + `TestCase` | 123 problems (70 verified + reference solution) | Sufficient pool for Bug Hunt / Dry-Run generation |
| `Company` | 13 | |
| `HrQuestion` | 158 | Powers STAR Roleplay |
| `Achievement` | 34 (9 arcade + 16 interview + 9 pipeline/belt) | |
| `AiInterview` | grows per session | |
| `TestReport` | grows per finished attempt | |
| `ConceptSynopsis` | grows via cache-first; shared across users | LLM cost warmup only |
| `GameContent` | grows via batch script / first play | `STAR_ROLEPLAY` / `BUG_HUNT` / `DRY_RUN` |

---

## API surface added this session

**Reports + synopses:**
- `POST /reports/generate` — implicit (fired from each quiz/interview handler; not called directly)
- `GET /reports/:id` — full report
- `GET /reports` — list recent
- `GET /reports/synopsis/:subject/:concept` — cache-first
- `POST /reports/synopsis/:subject/:concept/regenerate` — admin-ish force refresh

**Game content:**
- `GET /games-content/star-roleplay/random`
- `GET /games-content/time-rush/random?topicSlug=`
- `GET /games-content/bug-hunt/random`
- `GET /games-content/dry-run/random`

**Pipeline closed loop:**
- `POST /pipeline/current/inject-from-report/:reportId` — dedup + synopsis embed

---

## Files added this session

**Server (11 new):**
- `server/prisma/schema.prisma` — `TestReport`, `ConceptSynopsis`, `GameContent` models
- `server/src/services/synopsisService.ts`
- `server/src/services/reportService.ts`
- `server/src/services/starRoleplayService.ts`
- `server/src/services/codingGamesService.ts` (Bug Hunt + Dry-Run)
- `server/src/routes/reports.ts`
- `server/src/routes/gamesContent.ts`
- `server/ai/prompts/concept-synopsis.md`
- `server/ai/prompts/game-star-roleplay.md`
- `server/ai/prompts/game-bug-hunt.md`
- `server/ai/prompts/game-dry-run.md`
- `server/scripts/generate-game-content.ts`

**Client (10 new):**
- `client/src/pages/TestReport.tsx`
- `client/src/pages/ReportsInbox.tsx`
- `client/src/pages/PrepGamesHub.tsx`
- `client/src/pages/games/ComplexitySort.tsx`
- `client/src/pages/games/TimeRush.tsx`
- `client/src/pages/games/StarRoleplayGame.tsx`
- `client/src/pages/games/BugHunt.tsx`
- `client/src/pages/games/DryRun.tsx`
- `client/src/pages/games/SqlPuzzle.tsx`
- `client/src/pages/games/DiagramLabeler.tsx`
- `client/src/pages/games/sqlPuzzleData.ts`
- `client/src/pages/games/diagramLabelerData.ts`

**Modified:**
- `server/src/index.ts` — registered `/reports`, `/games-content` routes
- `server/src/routes/coreSubject.ts`, `interviewService.ts`, `aiInterviewService.ts`, `routes/pipeline.ts` — post-quiz report generation + pipeline inject endpoint
- `server/src/services/pipelineService.ts` — `injectStagesFromReport`
- `client/src/App.tsx` — routes for `test-report`, `reports`, `prep-games`, 7 game pages
- `client/src/components/LeftNav.tsx` — added "📝 Reports" and "🎮 Prep Games"
- `client/src/pages/PipelinePage.tsx` — synopsis bullet on current + missed cards
- `client/src/vite-env.d.ts` — sql.js module declarations
- `client/package.json` — added `sql.js@^1.14.2`

---

## Known limitations / follow-ups

- **Admin UI for synopsis regeneration** — endpoint exists (`POST /reports/synopsis/:subject/:concept/regenerate`) but no UI wrapper. Any authed user can call it today; consider gating to `ADMIN` role if content quality becomes a concern.
- **Concept tagging** stays deterministic (from question metadata). No LLM-based tagging step in `reportService.generateReport()` — the aptitude bank groups things at the topic level so weak concepts show as e.g. "Number System" not per-question fine-grained. Fine for MVP.
- **Time Rush topic coverage** — only 7 of the 32 `InterviewTheory` rows have ≥4 usable key points. Enriching the theory bank would broaden the game's pool.
- **Bug Hunt / Dry-Run cold-start** — first play triggers an LLM generation (~5-10s). Run `generate-game-content.ts` before demos to warm the cache.
- **Pipeline dedup** treats different `concept` values within the same `subject` as duplicates. Sometimes this over-skips (e.g., two distinct OS concepts share the OS subject). Fine unless the concept coverage per subject gets richer.

---

## Rerun playbook

**Fresh clone / DB reset:**
```bash
cd capstone/server
npx prisma db push               # NEVER `migrate dev`
npx prisma generate
npm run seed                     # base data + HR + core CS
npx tsx scripts/seed-interview-achievements.ts
npx tsx scripts/seed-pipeline-achievements.ts
```

**Warm the LLM game caches (before a demo):**
```bash
npx tsx scripts/generate-game-content.ts --kind=bug-hunt --count=15
npx tsx scripts/generate-game-content.ts --kind=dry-run  --count=15
```

**Aptitude data quality (re-run any time):**
```bash
npx tsx scripts/flag-invalid-aptitude.ts          # dry-run report
npx tsx scripts/flag-invalid-aptitude.ts --apply  # writes DB
```
