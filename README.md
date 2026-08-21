# LearnHub — Gamified Placement-Prep Platform

An AI-driven placement-preparation platform combining a personalized learning pipeline, three round types of AI mock interviews (HR / Technical / Coding), a curated question bank, and a gamified progression system with belts and achievements.

**Base project:** React + TypeScript client, Express + Prisma server, PostgreSQL, Redis, Piston (code sandbox), Groq (LLM), Gemini (resume parsing).

---

## What's in this branch (`feat/data-quality-pipeline`)

Everything below has been shipped on top of the base LearnHub interview-prep module. See [status.md](status.md) for the current implementation snapshot and [plan.md](plan.md) for the full design.

### 🎯 Personalized learning pipeline (new)
- **First-login diagnostic** — 21-question mix (aptitude + core CS + coding) with per-question timer, adaptive-ish difficulty, ~15 min
- **Skill profile** — per-pillar levels 1-5 + overall belt (Bronze → Diamond) written to `UserSkillProfile`
- **Auto-generated pipeline** — up to 15 stages interleaved across pillars, with unlock gates (quiz score / coding solves / mock interview score)
- **Missed vs skipped semantics** — skip = "missed, come back later" (amber section with "Complete now" CTA), not "done"
- **Preset packs** — balanced / placement-6w / coding-only
- Nine pipeline achievements + belt ladder

### 🎤 Three interview round types
- **HR round** — 158 seeded HR questions with STAR guidance, STAR-breakdown per turn, HR-specific scorer prompt
- **Technical round** — resume-aware (parses uploaded PDF with `pdf-parse` v2 + Gemini extraction), injects core-CS MCQs from `CoreSubjectQuestion`, technical-interviewer prompt
- **Coding round** — full-screen split-pane test interface: **consent gate** → **Monaco editor** (vs-dark, per-language code preservation) → **Run** (sample tests, full output) + **Submit** (hidden tests + AI rubric review). Live face-presence proctoring, proctor counts posted to server on submit
- Auto post-interview diagnosis → optional quests

### 🛡 Interviewer hardening
- Turn generator retries once on JSON parse failure, falls back to a safe clarify-request instead of dumping raw model output
- Message length hard-capped at 800 chars (real questions are 60 words)
- All 3 interviewer prompts have explicit "NEVER answer for the candidate" + "plain conversational English, no Markdown" rules

### 📊 Data quality
- 231 CN/OS/DBMS/SQL MCQs seeded into `CoreSubjectQuestion` from `capstone/data.json`
- Aptitude bank scrubbed: 5 rows with garbled trailing digits fixed, 5 orphaned-entity questions flagged `isValid: false` via `scripts/flag-invalid-aptitude.ts` (dry-run + `--apply`, idempotent, un-flags on rule relaxation)
- All read paths filter `isValid: true`

### 🏆 Gamification
- Interview XP rules + `calculateInterviewXp(roundType, overallScore, rubricScores)` helper
- 16 interview achievements + 9 pipeline achievements seeded (catalog: 9 → 34)
- New condition types: `interview_count`, `interview_score`, `rubric_perfect`, `round_variety`, `interview_improvement`, `coding_interview_ace`, `quest_count`, `streak_days`, `coding_solved`, `diagnostic_taken`, `belt_at_least`, `pipeline_stage_count`, `pipeline_finished`
- Recommendation engine (`recommendationService.ts`) — deterministic 5-tier daily suggestions

### 🖥 UI wiring
- Fullscreen pages (`interview-room`, `coding-interview-room`, `diagnostic-test`) truly take over the viewport — no bleed-through from top nav or sidebar
- `PipelinePage.tsx` with belt banner, current-stage card, missed section, upcoming (locked) list
- Post-login guard routes users: no profile → diagnostic intro, active pipeline → pipeline, else → interview home

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL (with a `learndb` database)
- Redis (localhost:6379)
- Docker (only if you want the Coding Round — needs Piston sandbox)

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

# LLM
GROQ_API_KEY=gsk-...             # required — used by all interviewer/scorer prompts
GOOGLE_API_KEY=...               # required for resume parsing (uses gemini-2.5-flash)

# Optional
REDIS_URL=redis://localhost:6379
PISTON_URL=http://localhost:2000
```

Push the schema + generate the client + seed:
```bash
npx prisma db push                             # NEVER `migrate dev` — see Gotchas
npx prisma generate
npm run seed                                   # base data + HR + core CS
npx tsx scripts/seed-interview-achievements.ts # 16 interview badges
npx tsx scripts/seed-pipeline-achievements.ts  # 9 pipeline badges
```

Optionally scrub the aptitude bank:
```bash
npx tsx scripts/flag-invalid-aptitude.ts          # dry-run report
npx tsx scripts/flag-invalid-aptitude.ts --apply  # writes DB
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

**Piston (optional — for coding rounds):**
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

1. **NEVER run `npx prisma migrate dev`** — the migration history is broken; it will offer to reset the DB. Always use `npx prisma db push`.
2. **Gemini `gemini-2.0-flash` has zero quota** on the current key. All Gemini calls (`resumeService.ts`, `diagnosisService.ts`) must use `gemini-2.5-flash`.
3. **Groq has no `response_format` support.** Scorer/diagnosis prompts instruct chain-of-thought before the JSON block; `extractJson()` handles best-effort recovery.
4. **`pdf-parse` v2 breaking change** — v1 was `pdfParse(buffer) → {text}`; v2 is `new PDFParse({data:buffer}).getText()`. Do not revert.
5. **Piston limits:** ~100 KB body cap, 3000 ms run timeout.
6. **Never hand-delete `server/prisma/data/daemon.lock`** — the content-pipeline daemon owns it.

---

## Repo layout

```
capstone/                    # outer git repo (this)
├── plan.md                  # full design doc — 6 original sprints + pipeline addendum
├── README.md                # this file
├── status.md                # implementation snapshot (updated per shipping session)
└── capstone/                # submodule — actual source
    ├── client/              # React + TypeScript + Vite + Monaco
    │   └── src/
    │       ├── pages/       # Includes PipelinePage, DiagnosticIntro/Test/Result,
    │       │                #  CodingInterviewRoom, InterviewChat, InterviewRoom, ...
    │       ├── components/  # LeftNav, SelfViewCamera, ...
    │       └── hooks/       # useCameraStream, useFacePresence, useQuizIntegrity
    └── server/              # Express + Prisma + Groq + Gemini
        ├── ai/prompts/      # interviewer.md, hr-interviewer.md, technical-interviewer.md,
        │                    #  coding-scorer.md, hr-scorer.md, scorer.md
        ├── prisma/
        │   ├── schema.prisma
        │   └── data/        # hr_questions.json, aptitude_questions.json, ...
        ├── scripts/         # seed-*.ts, flag-invalid-aptitude.ts, ...
        └── src/
            ├── routes/      # /diagnostic, /pipeline, /prep-tracker, /ai-interview, ...
            └── services/    # diagnosticService, pipelineService, aiInterviewService,
                             #  resumeService, diagnosisService, recommendationService, ...
```

See [plan.md](plan.md) for the design docs, [status.md](status.md) for the shipping snapshot.
