# LearnHub — Gamified Placement-Prep Platform

An AI-driven placement-preparation platform combining a **personalized learning pipeline**, three round types of AI mock interviews (HR / Technical / Coding), a **comprehensive test-report system** with LLM-generated concept synopses, and a **7-game gamified reinforcement library**.

**Base project:** React + TypeScript client, Express + Prisma server, PostgreSQL, Redis, Piston (code sandbox), Groq (LLM), Gemini (resume parsing), sql.js (in-browser SQL puzzles).

---

## The closed loop

Fresh account → **diagnostic** → **belt + skill profile** → **auto-generated pipeline** → user takes any quiz / mock / coding round → **comprehensive report** with per-mistake explanations + AI synopses of weak concepts → one click adds those concepts as new pipeline stages (with the synopsis pre-loaded as a study cue) → user takes the reinforcing quiz / **game** / mock → **gate fires** → stage completes → next unlocks → XP + belt + achievements update.

Everything below has been shipped on top of the base LearnHub interview-prep module. See [status.md](status.md) for the shipping snapshot and [plan.md](plan.md) + [plan-comprehensive-reports.md](plan-comprehensive-reports.md) for the design docs.

---

## What's in the app

### 🎯 Personalized learning pipeline
- **First-login diagnostic** — 21-question mix (aptitude + core CS + coding), ~15 min
- **Skill profile** — per-pillar levels 1-5 + overall belt (Bronze → Diamond) written to `UserSkillProfile`
- **Auto-generated pipeline** — up to 15 gated stages interleaved across pillars
- **Missed vs skipped semantics** — skip = "missed, come back later" (amber section + "Complete now" CTA), not "done"
- **Preset packs** — balanced / placement-6w / coding-only
- **Report-driven stage injection** — weak concepts from any test become new pipeline stages in one click

### 🎤 Three AI interview round types
- **HR round** — 158 seeded HR questions with STAR guidance; STAR-breakdown per turn
- **Technical round** — parses uploaded PDF resume (pdf-parse v2 + Gemini extraction), injects core-CS MCQs
- **Coding round** — full-screen split-pane test interface: consent gate → Monaco editor with per-language code preservation → **Run** (samples) + **Submit** (hidden tests + AI rubric review). Live face-presence proctoring
- Interviewer prompts hardened — never dumps raw model output, 60-word cap, "NEVER answer for the candidate" guardrail

### 📝 Comprehensive test reports
Automatically generated after every quiz / interview / coding round.
- **Focus areas** with weak concepts flagged
- **AI-generated synopses** per concept — 4-8 sentence spoken-friendly + 3-5 bullet keys + one "common mistake"
- **Recommended games** per weak concept
- **Per-question review** — your answer, correct answer, explanation, concept tag
- Reachable from any finish screen or the "📝 Reports" nav entry
- One-click "➕ Add to my pipeline" injects new stages with the synopsis pre-loaded

### 🎮 7 prep games (`/prep-games`)
Interview-shaped mini-games. Play a few between drills to reinforce concepts.

| Game | Reinforces | Data |
|------|-----------|------|
| 📊 **Complexity Sort** | Big-O intuition | 20 seeded algorithms |
| ⏱ **Time Rush** | Recall speed | 60-sec flashcard sprint on any topic |
| 🗣 **STAR Roleplay** | HR round instincts | LLM-generated 4-answer sets (cached) |
| 🐛 **Bug Hunt** | Code review | LLM-generated buggy code from real problems (cached) |
| 🔍 **Dry-Run** | Mental code execution | LLM-generated predict-the-output puzzles (cached) |
| 🗄 **SQL Puzzle** | Query fluency | sql.js in-browser DB + 8 seeded puzzles |
| 📐 **Diagram Labeler** | CN/DBMS visuals | OSI 7 layers, TCP handshake, ER diagram |

### 🏆 Gamification
- 34 achievements (9 arcade + 16 interview + 9 pipeline/belt)
- Interview XP rules keyed on round type + rubric quality
- Belt ladder: Unranked → Bronze → Silver → Gold → Platinum → Diamond
- Deterministic 5-tier daily recommendation service

### 🛡 Data quality
- 231 CN/OS/DBMS/SQL MCQs seeded into `CoreSubjectQuestion`
- Aptitude bank scrubbed — garbled options fixed, orphaned-entity questions flagged `isValid: false`; all read paths filter

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL with a `learndb` database
- Redis on `localhost:6379`
- Docker (only for the Coding Round — needs Piston sandbox)

### First-time setup

```bash
git clone <repo-url>
cd capstone/capstone
```

**Backend:**
```bash
cd server
npm install
```

Create `server/.env`:
```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/learndb
JWT_SECRET=your_super_secret_jwt_key_here
PORT=4000
NODE_ENV=development

# LLM — required
GROQ_API_KEY=gsk-...            # interviewer / scorer / synopsis / games
GOOGLE_API_KEY=...              # resume parsing (uses gemini-2.5-flash)

# Optional
REDIS_URL=redis://localhost:6379
PISTON_URL=http://localhost:2000
```

Push schema + generate + seed:
```bash
npx prisma db push                             # NEVER `migrate dev` — see Gotchas
npx prisma generate
npm run seed                                   # base data + HR + core CS
npx tsx scripts/seed-interview-achievements.ts # 16 interview badges
npx tsx scripts/seed-pipeline-achievements.ts  # 9 pipeline badges
```

Optional — scrub the aptitude bank:
```bash
npx tsx scripts/flag-invalid-aptitude.ts          # dry-run report
npx tsx scripts/flag-invalid-aptitude.ts --apply  # writes DB
```

Optional — warm the LLM game caches (recommended before a demo):
```bash
npx tsx scripts/generate-game-content.ts --kind=bug-hunt --count=15
npx tsx scripts/generate-game-content.ts --kind=dry-run  --count=15
```

Start the server:
```bash
npm run dev
# → http://localhost:4000
```

**Frontend:**
```bash
cd ../client
npm install
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:4000
```

```bash
npm run dev
# → http://localhost:5173
```

**Piston (only for coding rounds):**
```bash
docker-compose up piston
# → http://localhost:2000
```

### Demo login
- Email: `student@example.com`
- Password: `password`

Or register a fresh account → gets routed straight into the diagnostic → belt reveal → auto-generated pipeline.

---

## Critical Gotchas

1. **NEVER run `npx prisma migrate dev`** — migration history is broken; it will offer to reset the DB. Always use `npx prisma db push`.
2. **Gemini `gemini-2.0-flash` has zero quota** on the current key. All Gemini calls (`resumeService.ts`, `diagnosisService.ts`) must use `gemini-2.5-flash`.
3. **Groq has no `response_format` support.** Scorer/diagnosis prompts instruct chain-of-thought before the JSON block; `extractJson()` handles best-effort recovery. Interviewer generator retries once on parse failure, falls back to a safe clarify prompt.
4. **`pdf-parse` v2 breaking change** — v1 was `pdfParse(buffer) → {text}`; v2 is `new PDFParse({data:buffer}).getText()`. Do not revert.
5. **Piston limits:** ~100 KB body cap, 3000 ms run timeout.
6. **Never hand-delete `server/prisma/data/daemon.lock`** — the content-pipeline daemon owns it.
7. **sql.js WASM (~1MB)** is dynamic-imported inside the SQL Puzzle page — will not affect the app-shell bundle size.

---

## Repo layout

```
capstone/                        # outer repo (this)
├── plan.md                      # design doc — interview expansion + pipeline addendum
├── plan-comprehensive-reports.md  # reports + games design doc
├── README.md                    # this file
├── status.md                    # implementation snapshot
└── capstone/                    # submodule — actual source
    ├── client/                  # React + TS + Vite + Monaco + sql.js
    │   └── src/
    │       ├── pages/
    │       │   ├── games/       # 7 prep games (Complexity Sort, Time Rush,
    │       │   │                #   STAR Roleplay, Bug Hunt, Dry-Run,
    │       │   │                #   SQL Puzzle, Diagram Labeler)
    │       │   ├── TestReport.tsx, ReportsInbox.tsx
    │       │   ├── PipelinePage.tsx, PrepTrackerDashboard.tsx,
    │       │   │   PlacementDriveWizard.tsx, CoreCsHub.tsx,
    │       │   │   DiagnosticIntro/Test/Result.tsx,
    │       │   │   InterviewChat.tsx, InterviewRoom.tsx,
    │       │   │   CodingInterviewRoom.tsx, …
    │       │   └── PrepGamesHub.tsx
    │       ├── components/      # LeftNav, SelfViewCamera, …
    │       └── hooks/           # useCameraStream, useFacePresence, useQuizIntegrity
    └── server/                  # Express + Prisma + Groq + Gemini
        ├── ai/prompts/          # interviewer, scorer, diagnosis, concept-synopsis,
        │                        #   game-bug-hunt, game-dry-run, game-star-roleplay, …
        ├── prisma/
        │   ├── schema.prisma
        │   └── data/            # hr_questions.json, …
        ├── scripts/             # seed-*.ts, flag-invalid-aptitude.ts,
        │                        #   generate-game-content.ts
        └── src/
            ├── routes/          # /diagnostic, /pipeline, /prep-tracker,
            │                    #   /reports, /games-content, /ai-interview, …
            └── services/        # diagnosticService, pipelineService,
                                 #   reportService, synopsisService,
                                 #   starRoleplayService, codingGamesService,
                                 #   aiInterviewService, resumeService, …
```

See [plan.md](plan.md) + [plan-comprehensive-reports.md](plan-comprehensive-reports.md) for design docs, [status.md](status.md) for the shipping snapshot.
