# Implementation Status

_Last updated: 2026-07-08. Companion to [docs/interview-platform-plan.md](docs/interview-platform-plan.md) (full build plan) and [STATUS.md](STATUS.md) (platform audit)._

## ✅ Implemented

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
- **Context audit** (`server/scripts/audit-context.ts`, Gemini/Groq providers, resumable): 856/868 audited.
  Result: **712 self-contained · 46 missing context** (the "How is A related to B?" bug) **· 95 need figures · 3 incomplete · 12 pending re-run**
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
| Finish last 12 audit questions | none — just rerun | `npx ts-node scripts/audit-context.ts --provider groq --batch 12` |
| Figure-crop pipeline for 95 image questions | **needs `B2_course materials_60hr.pdf` re-supplied** (gone from this machine) | new `scripts/extract_figures.py` (PyMuPDF) → `assets.images` → render in runner |
| Repair the 46 missing-context questions | manual (review queue) or re-extraction once handout PDF is back | admin → Review Queue → 🧩 Missing Context |
| Formula-cleanup LLM pass (mangled stems → LaTeX for RichText) | same quota reset | new script, pattern of solve-and-verify |

### Phase B — Interview-first IA ✅ (done 2026-07-08; "weekly" leaderboard filter still open — needs an XP event log)

### Phase C — Company-wise sections (partially covered)
- ✅ Company prep hub with readiness, pattern mock, AI interview, coding-round tagging, HR company tags
- ⏳ Remaining: `CompanyQuestion` TECHNICAL tag table + a tabbed `CompanyDetail.tsx` (Overview · Coding · Technical · HR) consolidating the pieces that now exist separately

### Phase D — Coding tracks ✅ core done 2026-07-08
- ⏳ Remaining: grow the bank 36 → ~60 problems over the rest of the Striver-sheet syllabus (tries, bit-manipulation, more DP/graphs)

### Phase E — CS Core subjects (PDF staged, extraction not started)
- Extraction script for `cs_core_notes.pdf` → chapter-structured theory JSON (OS / OOPs / DBMS+SQL / CN)
- `CS_CORE` taxonomy + theory pages + per-chapter MCQs (LLM-generate → review queue → verify)
- Subject mock tests via existing assessment engine

### Phase F — HR & behavioral bank ✅ (done 2026-07-08)

### Phase G — Study games for interview prep (not started)
- `gameContentService` interview/CS-core mode (Memory Match formulas, Fill-the-Blank, Hangman terms, Concept Cannon true/false)
- "🎮 Study with Games" entry points on topic/chapter pages

### Cross-cutting
- Curate 1–2 YouTube links per CS-core chapter (`resources` field + embed component)
- Rotate the previously committed Firebase service key (still pending from Phase 1)
- Consider paid-tier Gemini key to unblock LLM passes at scale
