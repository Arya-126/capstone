# Implementation Status

Snapshot of what has actually landed on `feat/data-quality-pipeline`. Verify with `git status` / `git log` — this doc drifts.

**Last updated:** current shipping session (Sprints A-D of pipeline plan + interviewer hardening + coding-room revamp + resume-parser fix + aptitude data quality)

---

## Original 6-Sprint Plan (from base project)

| Sprint | Scope | Status |
|--------|-------|--------|
| 1 — HR round + data seeding | HrQuestion seeded (158), prompts, roundType | ✅ Done |
| 2 — Resume-aware technical | resumeService + technical-interviewer.md | ✅ **Now done** — pdf-parse v2 API fix + CoreSubjectQuestion seeded (231 rows) |
| 3 — Coding interview room | CodingInterviewRoom.tsx, coding-scorer.md | ✅ Done — full rewrite with Monaco, consent gate, Run/Submit split, fullscreen |
| 4 — Diagnosis + quest system | InterviewDiagnosis, UserQuest, diagnosisService | ✅ Done — 3 diagnoses generated so far, UserQuest table live |
| 5 — Full drive + prep tracker | PrepTrackerDashboard, PlacementDriveWizard, CoreCsHub | ✅ Done |
| 6 — Gamification + polish | Interview XP rules, 16 interview achievements, recommendationService | ✅ Done |

## Personalized Learning Pipeline (plan.md addendum)

| Sprint | Scope | Status |
|--------|-------|--------|
| A — Diagnostic backend | `UserSkillProfile`, `DiagnosticAttempt`, `LearningPipeline`, `PipelineStage` models; diagnosticService (item selection + grading + level → belt) | ✅ Done |
| B — Diagnostic UI + login gate | DiagnosticIntro / DiagnosticTest / DiagnosticResult pages; post-login profile check → routes to intro or pipeline | ✅ Done |
| C — Pipeline generator + gates | pipelineService (generateStages + checkPipelineGates); gate hooks wired into `/core-subjects/submit-quiz`, `submitInterviewQuiz`, `/code/submit`, `finishInterview`, `scoreCodingInterview`; PipelinePage.tsx with belt banner + current-stage card + upcoming list | ✅ Done |
| D — Polish + belts | 9 pipeline achievements + belt ladder (Bronze → Diamond); `diagnostic_taken` / `belt_at_least` / `pipeline_stage_count` / `pipeline_finished` condition types; achievement events fired from diagnosticService + pipelineService | ✅ Done |

## Bug fixes / hardening

| Fix | Status |
|-----|--------|
| pdf-parse v1 → v2 API migration (was throwing silently; UI showed "Could not extract text from PDF") | ✅ Done |
| Aptitude bank — 5 rows with garbled trailing digits fixed (`"None of these 96"` → `"None of these"`) | ✅ Done |
| Aptitude bank — `isValid` field + `flag-invalid-aptitude.ts` (dry-run + `--apply`); 5 orphaned-entity questions flagged; all read paths filter | ✅ Done |
| Interviewer turn generator dumped raw model output as spoken turn when JSON parse failed → 2000-word markdown treatises played as "questions" | ✅ **Done** — retry once + safe clarify fallback + 800-char hard cap |
| All 3 interviewer prompts (interviewer, hr, technical) — added explicit "NEVER answer for the candidate" + "plain conversational English, no Markdown" guardrails | ✅ Done |
| Skip pipeline stage was setting `isCompleted: true` (looked like completion) | ✅ Done — new `isSkipped` field, skipped stages surface in amber "Missed" section with "Complete now" CTA, clear on real gate completion |
| App.tsx — LeftNav + top nav bled through on `coding-interview-room` and `diagnostic-test` (not truly fullscreen) | ✅ Done — `FULLSCREEN_PAGES` set skips both wrappers |
| CodingInterviewRoom — plain textarea → Monaco editor with per-language code preservation | ✅ Done |
| CodingInterviewRoom — camera auto-started on mount (privacy) → consent gate blocks stream until user opts in | ✅ Done |
| CodingInterviewRoom — single "Submit" button posting to wrong endpoint → **Run** (`/code/run`, samples visible) + **Submit** (`/code/submit`, hidden tests + AI review, confirmation dialog) | ✅ Done |

## Data snapshot (live)

| Table | Rows | Notes |
|-------|------|-------|
| `InterviewCategory` | 3 | Quant / Logical / Verbal |
| `InterviewTopic` | 32 | |
| `InterviewQuestion` | 470 total (465 valid, 5 flagged `isValid=false`) | |
| `InterviewTheory` | 32 | |
| `CoreSubjectQuestion` | 231 (CN 62 / OS 59 / DBMS 58 / SQL 52) | Newly seeded this session |
| `CodingProblem` + `TestCase` | 123 problems, 16 DSA topics | |
| `Company` | 13 | |
| `HrQuestion` | 158 | |
| `Achievement` | 34 (9 game-arcade + 16 interview + 9 pipeline) | |
| `AiInterview` | 12 (of which several have `InterviewDiagnosis`) | |
| `PlacementDrive` | 1 | |
| `UserSkillProfile` / `LearningPipeline` | live per user | Created on diagnostic submit / pipeline generation |

## Data files present in `capstone/data.json` and `capstone/server/prisma/data/`

- `capstone/data.json` — CN/OS/DBMS/SQL 231 MCQs (seeded)
- `server/prisma/data/hr_questions.json` — 158 rows (seeded)
- `server/prisma/data/dsa_problems.json`, `handout_questions.json` — legacy content pipelines
- `server/prisma/data/cs_core_notes.pdf` — reference PDF used to smoke-test pdf-parse

## Files changed on this branch (`git status --short | wc -l` = ~67)

**Modified (server + client core):**
- `server/prisma/schema.prisma` — 4 new pipeline models + `isSkipped` + `isValid` fields
- `server/prisma/seed.ts` — fixed `data.json` path (was one dir off; silently skipped)
- `server/src/index.ts` — registered `/diagnostic`, `/pipeline`, `/prep-tracker`, `/quests`, `/placement-drive`, `/hr`, `/core-subjects` routes
- `server/src/services/aiInterviewService.ts` — round-type branching, XP + achievement + pipeline-gate wiring, hardened turn generator
- `server/src/services/interviewService.ts` — gate hook + `isValid` filter
- `server/src/services/xpService.ts` — 8 interview/quest XP rules + `calculateInterviewXp` helper
- `server/src/services/achievementService.ts` — widened aggregate query, 12 new condition types
- `server/src/services/llmService.ts` — Gemini 2.5 default, extractJson tweaks
- `server/src/routes/aiInterview.ts` — parse-resume endpoint
- `server/src/routes/code.ts` — pipeline gate hook after allPassed submit
- `server/ai/prompts/interviewer.md` — anti-answering guardrail + 60-word cap
- `client/src/App.tsx` — post-login guard, `FULLSCREEN_PAGES` set, new page routes
- `client/src/components/LeftNav.tsx` — "🎯 My Pipeline" first entry
- `client/src/pages/InterviewChat.tsx`, `InterviewHome.tsx`, `InterviewRoom.tsx` — round-type wiring
- `client/src/services/api.ts` — minor

**New (13+ pages, 6 services, 6 routes, 4 scripts, 3 prompts):**
- Pages: `CodingInterviewRoom.tsx`, `CoreCsHub.tsx`, `DiagnosticIntro.tsx`, `DiagnosticTest.tsx`, `DiagnosticResult.tsx`, `PipelinePage.tsx`, `PlacementDriveWizard.tsx`, `PrepTrackerDashboard.tsx`, `QuestHub.tsx`
- Services: `diagnosisService.ts`, `diagnosticService.ts`, `pipelineService.ts`, `placementDriveService.ts`, `recommendationService.ts`, `resumeService.ts`
- Routes: `coreSubject.ts`, `diagnostic.ts`, `pipeline.ts`, `placementDrive.ts`, `prepTracker.ts`, `quests.ts`
- Scripts: `flag-invalid-aptitude.ts`, `seed-interview-achievements.ts`, `seed-pipeline-achievements.ts`, `check-assessments.ts`, plus stages/lib scaffolding
- Prompts: `coding-scorer.md`, `hr-interviewer.md`, `hr-scorer.md`, `technical-interviewer.md`

## Known TODO / next candidates

- Tier 2C/D of coding-room polish: browser Fullscreen API enforcement + tab-blur/paste/copy proctoring signals
- Tier 3: countdown timer, split-pane resizer, keyboard shortcuts
- Interview transcript export / share
- Aptitude data quality — additional rules if more broken patterns surface
- Refresh flow for pipelines when profile shifts by ≥ 2 levels (currently user-triggered via "Regenerate")
