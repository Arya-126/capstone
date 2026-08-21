# LearnHub — Interview System Expansion (Plan Context)

This CLAUDE.md documents the **planned expansion** of the AI interview system. The plan itself lives in [plan.md](plan.md). The base project CLAUDE.md is at [capstone/CLAUDE.md](capstone/CLAUDE.md) — read that first for the tech stack, existing arcade + basic interview prep, and how to run the app.

## Scope

Turn the existing AI mock interview (which currently just scores 0-100 and writes free-text feedback) into a complete placement-prep loop:

1. **Three round types**: HR (behavioral, STAR-scored), Technical (resume-aware + core CS), Coding (live coding with camera + AI review)
2. **Unified diagnosis**: every round auto-maps weaknesses to specific learnable topics
3. **Quest system**: diagnoses spawn gamified quests with milestones (theory → quiz → game → coding → retake)
4. **Prep tracker dashboard**: radar chart, quest log, history timeline, readiness meter, streak calendar
5. **Full placement drive**: chains all three rounds + resume upload into one simulated interview

## What Already Exists (Don't Rebuild)

| Feature | Location | Details |
|---------|----------|---------|
| AI Mock Interview | `capstone/server/src/services/aiInterviewService.ts` + `client/src/pages/InterviewRoom.tsx` | 6-question conversational, TTS avatar, STT, proctoring (`useFacePresence`), delivery signals (WPM/fillers), rubric scoring on 5 axes |
| Aptitude Question Bank | `InterviewQuestion` (470 rows), `InterviewTheory` (32 rows) | 3 categories: Quant, Logical, Verbal — with pre-filled correct answers |
| Coding Sandbox | `capstone/server/src/services/codeRunnerService.ts` + `routes/code.ts` | Piston-backed, supports python/js/cpp/java. Endpoints: `/code/scratch` (freeform), `/code/run` (samples), `/code/submit` (hidden tests, records `UserProblemStatus`) |
| Coding Problems | `CodingProblem` (123 rows) + `TestCase` | 16 DSA topics, tagged by company for filtering |
| Companies | `Company` (13 rows) | Amazon, Microsoft, TCS, Infosys, etc. with `profile.interviewStyle` used by the interviewer prompt |
| Mastery + Weakness | `capstone/server/src/services/weaknessDetector.ts` | Recency-weighted mastery, auto-populates `StudyPlan` |
| XP + Levels + Streaks | `xpService.ts`, `streakService.ts`, `achievementService.ts` | 9 game-arcade achievements currently seeded |
| Company Readiness | `readinessService.ts` | Computed on-the-fly Placement Readiness Index |

## Data Inventory

| Source | Location | Contents | Status |
|--------|----------|----------|--------|
| 158 HR questions | `server/prisma/data/hr_questions.json` → `HrQuestion` table | 10 category buckets, STAR guidance + sample outlines + companyTags | **Seeded (158 rows)** |
| 231 core CS MCQs | `capstone/data.json` → `CoreSubjectQuestion` table | CN(62), OS(59), DBMS(58), SQL(52) — all with `q`, `opts`, `ans` (0-indexed), `exp` | **JSON present, table exists, 0 rows — still to seed** |
| 470 aptitude MCQs | `InterviewQuestion` table | Seeded, live | Done |
| 123 coding problems | `CodingProblem` table | Seeded, live | Done |
| 13 companies | `Company` table | Seeded, live | Done |

## Architecture: The Loop

```
Round (HR | Technical | Coding) → Diagnosis → Quests → Learning Actions → Retake
```

- **Round**: creates an `AiInterview` row with `roundType`. HR uses `HrQuestion`, Technical uses `CoreSubjectQuestion` + resume, Coding uses `CodingProblem`.
- **Diagnosis**: after scoring, a second LLM call (`diagnosisService.ts`) maps gaps → existing topic IDs (InterviewTopic + Domain/Topic + core CS subjects).
- **Quests**: `questService.ts` generates `PrepQuest` + `QuestMilestone` rows from the diagnosis. Milestones are ordered: theory → quiz → game → coding → retake.
- **Milestone completion**: hooks in existing activity handlers (quiz submit, game end, code submit, interview finish) auto-complete matching milestones and award XP.

See `plan.md` for full schema, prompts, and API surface.

## Progress Snapshot (verify with `git status` — this section drifts)

**Sprint 1 — HR round + data seeding: ✅ Done**
- `server/prisma/data/hr_questions.json` — 158 questions with STAR guidance
- `HrQuestion` table seeded (158 rows)
- `server/ai/prompts/hr-interviewer.md`, `hr-scorer.md` — written
- `AiInterview.roundType` (`"hr" | "technical" | "coding" | "full"`) added
- `AiInterviewTurn.starBreakdown` (Json) added
- `aiInterviewService.ts` branches on roundType, loads correct prompt

**Sprint 2 — Resume-aware technical round: ⚠️ Mostly done**
- `server/src/services/resumeService.ts` — written (uses pdf-parse + LLM)
- `AiInterview.resumeData` + `selectedQuestionIds` fields added
- `server/ai/prompts/technical-interviewer.md` — written, injects resume
- `InterviewRoom.tsx` + `App.tsx` — pass `roundType` + `resumeData` through
- **Gap:** `CoreSubjectQuestion` table exists but has 0 rows — seed from `capstone/data.json` (CN/OS/DBMS/SQL, 231 questions) is still to do

**Sprint 3 — Coding interview room: ❌ Not started**
- Missing: `client/src/pages/CodingInterviewRoom.tsx` (split-pane editor + camera + voice)
- Missing: `server/ai/prompts/coding-scorer.md`
- Missing: `AiInterviewCodingSubmission` model in schema

**Sprint 4 — Diagnosis + quest system: ❌ Not started**
- Missing models: `InterviewDiagnosis`, `PrepQuest`, `QuestMilestone`
- Missing services: `diagnosisService.ts`, `questService.ts`
- Missing prompt: `server/ai/prompts/diagnosis.md`

**Sprint 5 — Full drive + prep tracker: ❌ Not started**
- Missing pages: `PrepTracker.tsx`, `PlacementDriveFlow.tsx`, `CoreCSQuiz.tsx`
- Missing components: `SkillRadar.tsx`, `StreakCalendar.tsx`
- Missing routes: `prepTracker.ts`, `placementDrive.ts`
- Missing model: `PlacementDrive`

**Sprint 6 — Gamification + polish: ❌ Not started**
- `xpService.ts` — no HR/tech/coding XP rules yet
- Only 9 game-arcade achievements seeded — 20 interview achievements still to add
- Missing service: `recommendationService.ts`

## Implementation Order

Follow the 6 sprints in [plan.md](plan.md):

1. HR round + data seeding (2-3 days)
2. Resume-aware technical round (2-3 days)
3. Coding interview room with proctoring (3-4 days)
4. Diagnosis + quest system (2-3 days)
5. Full drive + prep tracker dashboard (2-3 days)
6. Gamification + polish (1-2 days)

Each sprint should land migrations, backend service, route, frontend page, and a manual smoke test before starting the next.

## Critical Gotchas

Verify these against current state — memory records dated 2026-07-12 may be stale:

1. **Prisma migrate is broken** — DO NOT run `npx prisma migrate dev` (missing history entry `20260518071756_sync_schema` will trigger a destructive reset prompt; NEVER accept it). Use `npx prisma db push` for schema changes during development. If the user asks for a proper migration later, we can rebuild the history separately.

2. **Gemini quota** — `gemini-2.0-flash` has zero quota on the user's key. Use `gemini-2.5-flash` for any Gemini-backed LLM call in the new services (`diagnosisService`, `resumeService`, HR scorer). Groq (Llama 3.3 70B) is the default per the base CLAUDE.md.

3. **Piston limits** — request body cap ~100 KB, max 3000 ms run timeout. The coding interview room reuses existing `runSubmission` — no new limits to worry about, but don't crank the code editor's max input size beyond what's already accepted by `/code/scratch`.

4. **Groq JSON** — no `response_format` support; scorer/diagnosis prompts must instruct chain-of-thought BEFORE the JSON block and rely on `extractJson()` from `llmService.ts` (already handles this pattern in the existing scorer).

5. **Never hand-delete `capstone/server/prisma/data/daemon.lock`** — the content pipeline daemon owns it. Stale detection handles crashes.

6. **Voice/camera in the coding room** — reuse `useCameraStream`, `useFacePresence`, `useQuizIntegrity`, and `defaultStt` from `client/src/hooks/` and `interview/providers/`. Do NOT introduce a new camera stack. StrictMode double-invocation of state updaters is a known trap — see `InterviewRoom.tsx` for the ref-based workaround.

7. **PDF parsing** — `pdf-parse` is not in the current dependencies. `npm install pdf-parse` in `capstone/server/` before Sprint 2.

## Design Principles (Carried From Base CLAUDE.md)

- **Static data over LLM for factual content**: HR STAR guidance is generated ONCE at seed time and stored, not re-generated per interview.
- **Separate tables for interview prep vs. game arcade**: `InterviewCategory/Topic/Question` never mix with `Domain/Topic`.
- **Grading via direct comparison, not LLM**: Core CS quiz submissions grade against `answerIndex` in the DB, same pattern as `submitInterviewQuiz`.
- **Computed scores, not stored**: `readinessService.ts` computes on the fly. `PrepTracker`'s readiness meter follows the same pattern — no cache table.
- **Round-type separation**: HR, Technical, Coding have different rubrics and UIs. `AiInterview.roundType` branches, but each round is a distinct scoring pipeline.

## How to Run (Same as Base Project)

```bash
# Terminal 1 — Server
cd capstone/server && npm run dev

# Terminal 2 — Client
cd capstone/client && npm run dev

# Terminal 3 — Piston (for coding interviews)
docker-compose up piston  # or however it's currently launched — see capstone/docs/OPERATIONS.md

# Requires: Redis on 6379, PostgreSQL "learndb"
```

After schema changes: `cd capstone/server && npx prisma db push && npx prisma generate` (NOT `migrate dev` — see gotcha #1).

After adding seed data: `npx prisma db seed`.

Demo login: `student@example.com` / `password`.
