# Implementation Status

_Last updated: 2026-07-10. Companion to [docs/interview-platform-plan.md](docs/interview-platform-plan.md) (full build plan) and [STATUS.md](STATUS.md) (platform audit)._

## ✅ Implemented

### Phase G — Interview games unblocked (2026-07-10 session)
- Authored `server/prisma/data/interview_theory.json` (in-repo — replaces the previous `~/Downloads` dependency) for **10 aptitude topics** across Quantitative Aptitude + Logical Reasoning. Each topic has ~250-word rawTheory, 6-8 keyPoints, and 3-5 formulas — enough for the derivation service to produce ≥4 items for every one of the 6 classic games. New `seed-interview-theory.ts` upserts categories + topics + theory and reports per-topic availability. End-to-end game rendering confirmed in-browser.

### Phase D — Coding bank grown to 56 (2026-07-10 session)
- 20 new authored problems (118 test cases) via `seed-tracks-extra.ts`; 3 new tracks (tries, prefix-sum, matrix). All pass a Piston-free local-Python smoke check (`_verify-local.ts`). Verified flag stays false until Piston + `verify-dsa.ts` are run.

### Phase C — Consolidated CompanyDetail (2026-07-10 session)
- `CompanyQuestion` Prisma model + migration `20260710155749_company_questions`; 120 authored technical/system-design questions seeded across Amazon, Microsoft, Goldman Sachs, JP Morgan, TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini via `seed-company-technical.ts`.
- New `GET /companies/:slug/detail` bundling coding (company-tagged verified problems + user solved state), technical (grouped by subject), and HR (company-tagged) alongside the existing prep payload.
- New `CompanyDetail.tsx` with tabs **Overview · Coding · Technical · HR** — Overview keeps the existing `CompanyPrep` block; other tabs add subject/category chip filters and a light markdown renderer for answer hints. `App.tsx` now routes `company-prep` state to the tabbed detail; ProblemSolver + HR-in-AI-room hand-offs are wired.

### Phases B + D + F (2026-07-08 session)
- **Phase B — Interview-first IA**: `InterviewHome.tsx` is the post-login landing page; persistent `LeftNav` (PREP / COMPETE / MORE / ADMIN sections) wraps all signed-in pages; `StatsSidebar` (XP/streak/rank, coding progress, weak topics, mini leaderboard) backed by `GET /leaderboard/sidebar`; leaderboard gained **metric tabs** (XP | Coding = problems solved | Aptitude = avg best test score) on top of the existing scope tabs (global | cohort | friends).
- **Phase D — Coding tracks**: `CodingProblem.track/level` + `UserProblemStatus` (ATTEMPTED/SOLVED, bestScore, auto-updated by `/code/submit`); `GET /coding-tracks` track map + `/summary`; `CodingTracks.tsx` (level node chains, per-track %) → standalone `ProblemSolver.tsx` (statement + RichText/KaTeX, per-language editor, run samples / submit hidden, solved banner). Bank grown 22 → **36 problems, all Piston-verified** (14 new original problems across linked-list, trees, graphs, DP, binary-search, two-pointers, sliding-window, stacks-queues, strings, heaps via `seed-tracks.ts`).
- **Phase F — HR & behavioral bank**: `HrQuestion` model + `/hr` routes; **60 authored questions** across 11 categories with STAR guidance, sample outlines, and company tags (`seed-hr.ts`); `HrPrep.tsx` browse page whose "Practice with AI" deep-links into the voice+avatar interview room seeded with the chosen question.

### Competitive pillars (2026-07-07 session, commit f51a710)
- **Company pattern engine**: per-company readiness index (`readinessService.ts`), prep hub (`CompanyPrep.tsx`), role tracks, round drills, company-tagged coding problems preferred in CODING rounds.
- **Cohorts / contests / social**: cohort join codes, friends graph, scoped leaderboards, timed contests reusing the assessment engine with score+speed ranking and idempotent placement-XP settlement.
- **Interview realism**: adaptive follow-up probing (JSON interviewer turns + deterministic guards), in-room code pad (`/code/scratch`), speech-delivery signals (WPM/fillers, informational), free neural TTS (Edge) with real lip-sync on a photo avatar.

### Platform base (Phases 1–8, June 2026)
- **Aptitude bank** — 868 questions (Quant / Logical / Verbal) seeded from the handout, 62-topic taxonomy
- **Mock test engine** — builder, proctored runner (camera + tab-switch + fullscreen detection, consent gate), server-authoritative grading, autosave/resume, scorecard with weak-topic analysis + practice-test generation, admin cohort reports, CSV export
- **Coding** — Piston sandbox (Python / JS / C++ / Java), 14 verified DSA problems with 164 run-the-reference test cases, Monaco editor, run-samples / submit-hidden
- **AI interview** — chat + face-to-face room (avatar, voice, captions, camera signal), rubric scoring /100
- **Company prep (v1)** — 13 companies with pattern profiles, pattern mocks, company-styled AI interviews
- **Gamification** — XP, ranks, streaks, achievements, leaderboard, 7 game engines (learning domains only)
- **Admin review queue** for unverified questions

### Data-quality work — Phase A (2026-07-07 session)
- **Context audit** (`server/scripts/audit-context.ts`, Gemini/Groq providers, resumable): 868/868 audited (2026-07-10 re-run).
  Result: **713 self-contained · 54 missing context** (the "How is A related to B?" bug) **· 95 need figures** (91 pre-flagged `requiresImage` + 4 audit-classified) **· 6 incomplete** (2 pre-flagged + 4 audit-classified)
- **Broken questions hidden** — test assembly (`assessmentService.ts`) now excludes audit-flagged, incomplete, and image-less figure questions on all test types
- **Review queue** — new "🧩 Missing Context" filter + audit badges with hover reasons
- **Formula rendering** — KaTeX + `client/src/components/RichText.tsx` (renders `$...$` / `$$...$$` in stems, options, context, explanations in the runner)
- **Cross-model verification** — `solve-and-verify.ts` upgraded: Gemini pass A + Groq pass B must independently agree before auto-verify
- **CS-core notes PDF** staged at `server/prisma/data/cs_core_notes.pdf` (gitignored) — OS, OOPs, DBMS+SQL, CN

---

## ⏳ Left to do

### Phase A remainder (data quality)
| Task | Blocker | Command / where |
|---|---|---|
| Solve-and-verify run (~740 questions → verified answer keys) | API quotas reset ~midnight PT (Gemini free tier + Groq 70b/day both spent) | `cd server && npx ts-node scripts/solve-and-verify.ts` |
| ~~Finish last 12 audit questions~~ ✅ done 2026-07-10 (full 868/868 audit) | — | — |
| Figure-crop pipeline for 95 image questions | **needs `B2_course materials_60hr.pdf` re-supplied** (gone from this machine) | new `scripts/extract_figures.py` (PyMuPDF) → `assets.images` → render in runner |
| Repair the 46 missing-context questions | manual (review queue) or re-extraction once handout PDF is back | admin → Review Queue → 🧩 Missing Context |
| Formula-cleanup LLM pass (mangled stems → LaTeX for RichText) | same quota reset | new script, pattern of solve-and-verify |

### Phase B — Interview-first IA ✅ (done 2026-07-08; "weekly" leaderboard filter still open — needs an XP event log)

### Phase C — Company-wise sections ✅ done 2026-07-10
- ✅ Company prep hub with readiness, pattern mock, AI interview, coding-round tagging, HR company tags
- ✅ `CompanyQuestion` model (TECHNICAL / SYSTEM_DESIGN, subject: OS/DBMS/OOPS/CN/DSA/SYSTEM_DESIGN, answer hints) + `seed-company-technical.ts` (**120 authored, non-scraped questions** across the top 10 companies)
- ✅ `GET /companies/:slug/detail` bundles the four tabs: readiness (Overview), tagged CodingProblems + solved state, CompanyQuestion by subject, HR prompts tagged with the company slug
- ✅ `CompanyDetail.tsx` — 4-tab UI (Overview embeds existing `CompanyPrep` unchanged) with subject/category chip filters, collapsible answer hints (bold + code markdown), and deep-links into Problem Solver + AI Interview room

### Phase D — Coding tracks ✅ core done 2026-07-08; bank grown to 56 on 2026-07-10
- Added `scripts/seed-tracks-extra.ts` with **20 new authored problems** (118 test cases) — 3× tries, 4× bit-manipulation, 3× more DP (house-robber, grid paths, edit distance), 3× more graphs (BFS shortest path, connected components, Dijkstra), 2× prefix-sum (new track), 2× hashing, 2× matrix (new track), 1× longest palindromic substring. Bank now **56 problems across 19 tracks**.
- Added `scripts/_verify-local.ts` — Piston-free smoke check that runs each problem's Python reference against its stored test cases via the local Python interpreter. All 20 new problems pass locally (fixed 2 wrong expected outputs during authoring).
- ⏳ **Remaining**: the 20 new problems land `verified=false` (assessment engine gates by `verifiedOnly`), so they don't yet appear in the Coding Tracks page. Needs Docker + `docker compose up -d` + `npx ts-node scripts/verify-dsa.ts` to flip them.

### Phase E — CS Core subjects (PDF staged, extraction not started)
- Extraction script for `cs_core_notes.pdf` → chapter-structured theory JSON (OS / OOPs / DBMS+SQL / CN)
- `CS_CORE` taxonomy + theory pages + per-chapter MCQs (LLM-generate → review queue → verify)
- Subject mock tests via existing assessment engine

### Phase F — HR & behavioral bank ✅ (done 2026-07-08)

### Phase G — Study games for interview prep ✅ unblocked 2026-07-10
- ✅ `interviewGameContentService.ts` derives all 6 classic games (MEMORY_MATCH, WORD_SCRAMBLE, CROSSWORD, HANGMAN, FILL_BLANK, CONCEPT_CANNON) plus 3 formula games (Flash Cards / Match / Sprint) from `InterviewTheory.rawTheory + keyPoints + formulas`
- ✅ `GET /games/mini/:topicId/:gameType` transparently routes interview topics through the derivation and submissions land on `UserInterviewProgress`
- ✅ Entry-point buttons wired: "⚡ Games" per topic in `InterviewCategory.tsx`, "🎮 Study with Games" in `InterviewTheory.tsx`, `InterviewGameSelect.tsx` picker + `/games/interview-availability/:topicId` gate
- ✅ **Data seeded**: `server/prisma/data/interview_theory.json` (in-repo, not a Downloads path) authored with 10 topics — 8 Quantitative Aptitude (Percentages, Profit & Loss, SI/CI, Averages, Ratios & Proportions, Time-Speed-Distance, Number System, Permutations & Combinations) + 2 Logical Reasoning (Clocks, Calendars). New `scripts/seed-interview-theory.ts` upserts categories + topics + theory and prints a per-topic game-availability table. Every topic gets all 6 classic games available. End-to-end verified in browser: Interview Hub → Quantitative Aptitude → Percentages → ⚡ Games → Memory Match renders with terms/definitions derived from the authored theory.
- ⏳ Optional next: extend the seed to also load `InterviewQuestion` rows so the "🎮 Quiz" button works for these topics too (currently 0 Qs). Bridge candidate: point the quiz button at `AssessmentTopic` of the same slug and use the existing 868-question aptitude bank.

### Cross-cutting
- Curate 1–2 YouTube links per CS-core chapter (`resources` field + embed component)
- Rotate the previously committed Firebase service key (still pending from Phase 1)
- Consider paid-tier Gemini key to unblock LLM passes at scale
