# Plan: Comprehensive Post-Test Reports + Gamified Concept Reinforcement

Companion to [plan.md](plan.md). Focuses on **making test/interview results actionable** — comprehensive mistake reports, AI-generated concept synopses for weak areas, and a curated game library to reinforce each concept.

## Scope

Right now, when a user finishes a test/quiz/interview:
- Aptitude quiz: a scorecard + per-question correct-answer reveal (already OK for that flow)
- Core CS quiz: score + basic per-question `isCorrect` (thin)
- AI interview: rubric + free-text `strengths/gaps/nextSteps` + diagnosis mapped to topic IDs
- Coding round: rubric + `complexityAnalysis` + `alternativeApproach`

What's **missing**:
1. A **unified "Comprehensive Report"** — one page per attempt showing every mistake, why it was wrong, what concept it maps to, and what to do next
2. **AI-generated concept synopses** for the specific weak concepts (short, spoken-friendly, cached per concept)
3. **A game recommender** — for each weak concept, one CTA to play the game that most reinforces it
4. **New game types** beyond the current 9 that are specifically effective for placement prep (coding, debugging, system-design intuition, SQL fluency, HR STAR practice, diagrams)

## What Already Exists (Don't Rebuild)

| Piece | Where | Notes |
|-------|-------|-------|
| 9 game engines | `client/src/pages/games/*` | MCQ, MemoryMatch, WordScramble, Crossword, Hangman, FillTheBlank, ConceptCannon, FormulaFlashCards, FormulaMatch, ConceptSprint |
| Post-quiz result screens | `InterviewQuiz.tsx`, `CoreCsHub.tsx`, ai-interview report | Each does its own thing — no shared "report" component |
| Weakness detector | `weaknessDetector.ts` | Recency-weighted per-topic mastery |
| Interview diagnosis | `diagnosisService.ts` (LLM) + `InterviewDiagnosis` table | Maps gaps → topic IDs after interview |
| Recommendation service | `recommendationService.ts` | 5-tier daily suggestions |
| Theory content | `InterviewTheory` (32 rows) — keyPoints, formulas, tutorialSections | Ready to feed synopses + game-content generators |
| LLM plumbing | `llmService.ts` — `chat()`, `extractJson()`, Groq primary, Gemini secondary | Already handles JSON extraction defensively |

---

# Part A — New Games (7 additions)

The current games skew toward theory recall (word scramble, hangman, crossword). Placement prep needs **more reasoning-shaped** games. Suggestions ranked by data-availability and prep impact:

| # | Game | Reinforces | Data source | Implementation effort |
|---|------|-----------|-------------|-----------------------|
| 1 | **Bug Hunt** — 15-line code snippet with 1-3 intentional bugs; player clicks the wrong line(s) | Coding review, debugging, careful reading | `CodingProblem` reference solutions + LLM-generated bug variants (cached) | M (needs bug-injection LLM prompt, click-a-line UI) |
| 2 | **Dry-Run / Trace Output** — code snippet + input, player predicts stdout | Reading unfamiliar code, mental execution | Snippet + expected-output pairs; LLM-generated from `CodingProblem` reference solutions | S-M |
| 3 | **Complexity Sort** — 4-6 algorithm names, player drags them in Big-O order | Big-O intuition, DSA foundations | Small seeded JSON (~50 algo→complexity pairs) | S |
| 4 | **SQL Puzzle** — given a small schema + a plain-English query, player writes SQL | DBMS/SQL fluency | `CoreSubjectQuestion` SQL topic + seeded schemas + expected result tables; validate by running SQLite-in-browser (sql.js) | M-L (needs sql.js integration) |
| 5 | **Diagram Labeler** — labeled diagram (OSI 7 layers, TCP handshake, DBMS ER) with labels stripped; drag correct label to each slot | OS/CN/DBMS visual intuition | Seeded SVG + label sets (~10 diagrams) | M (need SVG/label positions in JSON) |
| 6 | **STAR Roleplay** — HR scenario ("teammate isn't contributing") + 4 candidate answers (one strong STAR, three weaker); pick the best | HR round instincts | `HrQuestion` prompts + LLM-generated 4-answer sets (cached) | S-M |
| 7 | **Time Rush** — 60-second flashcard rush; count of correct answers | Recall speed under pressure | `InterviewTheory.keyPoints` (already seeded) | S |

**Recommendation for MVP:** Ship #3 (Complexity Sort), #6 (STAR Roleplay), #7 (Time Rush) first — small effort, wide coverage, all data already exists. Add #1 (Bug Hunt) and #2 (Dry-Run) in a second sprint (they need LLM-generated content pipelines like the existing MCQ audit flow). Save #4 (SQL Puzzle) and #5 (Diagram Labeler) for a third sprint — highest implementation cost.

**Prisma schema addition:**

```prisma
// Extend GameType enum
enum GameType {
  MCQ
  MEMORY_MATCH
  WORD_SCRAMBLE
  CROSSWORD
  HANGMAN
  FILL_BLANK
  CONCEPT_CANNON
  // NEW
  BUG_HUNT
  DRY_RUN
  COMPLEXITY_SORT
  SQL_PUZZLE
  DIAGRAM_LABEL
  STAR_ROLEPLAY
  TIME_RUSH
}

// Cached game content — some games need pre-generated puzzles. Cache
// them per (gameType, topicSlug/subject) so we don't call LLM every play.
model GameContent {
  id          String   @id @default(uuid())
  gameType    GameType
  subject     String   // "OS" | "DSA" | topic slug etc.
  topicSlug   String?
  payload     Json     // shape depends on gameType (see docs/game-payloads.md)
  difficulty  String   @default("medium")
  source      String?  // "seed" | "llm-groq" | "llm-gemini"
  createdAt   DateTime @default(now())

  @@index([gameType, subject])
}
```

**Prompt files (new, in `server/ai/prompts/`):**
- `game-bug-hunt.md` — takes a `CodingProblem` reference solution, returns `{ buggyCode, bugLines: [n1, n2], hint }`
- `game-dry-run.md` — takes a `CodingProblem` + input, returns `{ snippet, input, expectedOutput }`
- `game-star-roleplay.md` — takes an HR scenario, returns 4 candidate answers with `{ text, quality: "strong"|"weak-vague"|"weak-blame"|"weak-generic", starPresent: {...} }`

---

# Part B — Comprehensive Test Report

## New Model

```prisma
model TestReport {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  sourceType    String   // "core-cs-quiz" | "aptitude-quiz" | "ai-interview" | "coding-round" | "placement-drive"
  sourceId      String   // FK to the underlying attempt row
  overallScore  Float
  perQuestion   Json     // [{ questionId, prompt, userAnswer, correctAnswer, isCorrect, explanation, conceptTag }]
  weakConcepts  Json     // [{ concept, subject, missCount, missedQuestionIds: [] }]
  strongConcepts Json    // [{ concept, subject, correctCount }]
  createdAt     DateTime @default(now())

  synopses      ConceptSynopsis[]  // relation via join model or embedded — see below

  @@index([userId, sourceType])
}

// Cached LLM synopsis per concept — one per (subject, concept), regenerated
// only when explicitly invalidated. All reports referencing the same concept
// share the same synopsis row → cheap LLM cost.
model ConceptSynopsis {
  id         String   @id @default(uuid())
  subject    String   // "OS", "CN", "DBMS", "SQL", "DSA", "HR", ...
  concept    String   // "Virtual Memory", "TCP 3-way handshake", "Normalization 3NF"
  synopsis   String   // 4-8 sentence spoken-friendly explanation
  bulletKeys String[] // 3-5 crisp bullet points for the report card
  commonMistakes String? // "Confuses paging with segmentation…"
  recommendedGames Json // [{ gameType, topicSlug, reason }]  ← from Game Recommender
  generatedBy String   @default("groq") // "groq" | "gemini" | "human-authored"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([subject, concept])
}
```

## Service — `reportService.ts`

```typescript
// Called AFTER any test/interview finish. Aggregates the attempt data into
// a TestReport row, tags each miss with a concept, and fires off
// synopsisService.getOrGenerate(...) for each weak concept.

async function generateReport(
  userId: string,
  source: { type: string; id: string }
): Promise<TestReport> {
  // 1. Load the source attempt (branched on type)
  // 2. For each answered question:
  //     - Compare user's answer to correct answer
  //     - Look up the concept tag (from question metadata or LLM-classified)
  //     - Build per-question record: { prompt, userAnswer, correctAnswer, isCorrect, explanation, conceptTag }
  // 3. Aggregate: weakConcepts = concepts with ≥2 misses OR miss rate > 40%
  // 4. Trigger synopsis generation for each weak concept (parallel, non-blocking)
  // 5. Write TestReport row
  // 6. Return the report (synopses may still be generating — client polls or streams)
}
```

## Concept tagging

- **Aptitude & core CS MCQs**: use existing topic/subject as `conceptTag` (cheap, deterministic)
- **AI interview turns**: reuse `InterviewDiagnosis.weakAreas` (already tags by area)
- **Coding round**: reuse the `CodingProblem.topic.slug` (arrays / graphs / DP etc.)
- **PlacementDrive**: aggregate the 3 rounds' concept tags

**No LLM needed for tagging in v1** — every question already has enough metadata.

## Client — `TestReport.tsx`

One shared component used by every "results" screen. Sections:

1. **Header** — overall score, source type, date, "Retake" CTA
2. **Weak concepts (top of page)** — for each: name + subject chip + miss count + synopsis card (with "Read full synopsis" expand)
3. **Recommended actions per weak concept** — 2-3 buttons: `▶ Play [Bug Hunt]` / `📖 Read [OS theory]` / `🔁 Retry the questions I got wrong`
4. **Per-question review** — collapsible list of every question, expanded on the misses:
   - Your answer (red)
   - Correct answer (green)
   - Explanation (from `question.explanation` — already stored)
   - "Learn this concept" chip → jumps to the concept card above
5. **Strengths** (bottom, quiet) — concepts they nailed

## API surface

```
POST   /reports/generate     { sourceType, sourceId }  → { reportId, report }
GET    /reports/:id                                    → full report
GET    /reports?userId=me&limit=10                     → history (for the prep tracker)
POST   /synopses/:subject/:concept/regenerate          → force-refresh a stale synopsis
GET    /synopses/:subject/:concept                     → return cached (or generate)
```

`POST /reports/generate` is called automatically from:
- `submitInterviewQuiz` (aptitude), `submitQuiz` (core CS) — after the score is computed
- `finishInterview`, `scoreCodingInterview` — after diagnosis
- `PlacementDrive` finish

Client just navigates to `/reports/:id` — the report is ready.

---

# Part C — Concept Synopsis Generator

## Service — `synopsisService.ts`

```typescript
// Idempotent: (subject, concept) is unique, cached forever unless
// explicitly regenerated. Cache hit = no LLM call, ~5ms return.

async function getOrGenerate(subject: string, concept: string): Promise<ConceptSynopsis> {
  const cached = await prisma.conceptSynopsis.findUnique({
    where: { subject_concept: { subject, concept } },
  });
  if (cached) return cached;

  const prompt = loadPrompt('concept-synopsis', { subject, concept });
  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 800 });
  const parsed = extractJson<{
    synopsis: string;
    bulletKeys: string[];
    commonMistakes: string;
  }>(raw);
  if (!parsed?.synopsis) throw new Error('Synopsis generation failed');

  // Ask the game recommender for its 2-3 picks
  const recommendedGames = await recommendGamesForConcept(subject, concept);

  return prisma.conceptSynopsis.create({
    data: {
      subject,
      concept,
      synopsis: parsed.synopsis.slice(0, 1200),   // spoken-friendly length cap
      bulletKeys: parsed.bulletKeys.slice(0, 5),
      commonMistakes: parsed.commonMistakes?.slice(0, 400) ?? null,
      recommendedGames,
      generatedBy: 'groq',
    },
  });
}
```

## Prompt — `server/ai/prompts/concept-synopsis.md`

```
You are a placement-prep tutor. A student got questions wrong on
"{{concept}}" in {{subject}}. Write a short, spoken-friendly synopsis
they can absorb in 60 seconds.

Rules:
- Plain conversational English. No markdown, no bullet symbols in prose.
- 4-8 sentences total for `synopsis`.
- `bulletKeys`: 3-5 crisp bullets, each < 15 words.
- `commonMistakes`: one sentence identifying the most common misconception.

Respond with ONLY a JSON object:
{
  "synopsis": "…",
  "bulletKeys": ["…", "…", "…"],
  "commonMistakes": "…"
}
```

## Caching + invalidation

- **Default:** never invalidate — a synopsis for "TCP 3-way handshake" doesn't go stale
- **Manual invalidation:** admin route `POST /synopses/:subject/:concept/regenerate` if a synopsis reads poorly
- **Bulk regeneration script:** `scripts/regenerate-synopses.ts` for when we change the prompt

---

# Part D — Game Recommender

## Service — `gameRecommenderService.ts`

Deterministic, no LLM. A table maps `(subject, gameType)` → suitability score. Given a concept:

```typescript
const GAME_FIT: Record<string, Record<string, number>> = {
  // subject → { gameType → score 0-1 }
  OS:      { CONCEPT_CANNON: 0.9, MCQ: 0.7, DIAGRAM_LABEL: 0.95, TIME_RUSH: 0.6 },
  CN:      { DIAGRAM_LABEL: 1.0, CONCEPT_CANNON: 0.8, MCQ: 0.7 },
  DBMS:    { SQL_PUZZLE: 0.95, MCQ: 0.7, DIAGRAM_LABEL: 0.6 },
  SQL:     { SQL_PUZZLE: 1.0, FILL_BLANK: 0.7 },
  DSA:     { COMPLEXITY_SORT: 0.9, BUG_HUNT: 0.85, DRY_RUN: 0.9, MCQ: 0.6 },
  HR:      { STAR_ROLEPLAY: 1.0 },
  Aptitude:{ MCQ: 0.8, TIME_RUSH: 0.7 },
};

async function recommendGamesForConcept(subject: string, concept: string) {
  const fit = GAME_FIT[subject] || { MCQ: 1.0 };
  // Pick top 2-3 game types by score, then find an actual GameContent row
  // (or fall back to using existing topic questions for MCQ/CONCEPT_CANNON)
  return topGameTypes.map((gt) => ({
    gameType: gt,
    topicSlug: /* looked up from InterviewTopic by concept */,
    reason: /* short human-readable */,
  }));
}
```

Cheap, testable, extensible.

---

# Schema Summary (new tables)

- `TestReport` — one per attempt (or on-demand computed)
- `ConceptSynopsis` — cached per concept, shared across reports
- `GameContent` — cached puzzle payloads for new games
- `GameType` enum extended by 7 values

# Files (new — 20 total)

**Server (11):**
- `server/src/services/reportService.ts`
- `server/src/services/synopsisService.ts`
- `server/src/services/gameRecommenderService.ts`
- `server/src/routes/reports.ts`
- `server/src/routes/synopses.ts`
- `server/ai/prompts/concept-synopsis.md`
- `server/ai/prompts/game-bug-hunt.md`
- `server/ai/prompts/game-dry-run.md`
- `server/ai/prompts/game-star-roleplay.md`
- `server/scripts/seed-complexity-sort.ts` (small JSON → GameContent)
- `server/scripts/regenerate-synopses.ts`

**Client (9):**
- `client/src/pages/TestReport.tsx`
- `client/src/components/ConceptCard.tsx`
- `client/src/components/QuestionReviewCard.tsx`
- `client/src/pages/games/BugHunt.tsx`
- `client/src/pages/games/DryRun.tsx`
- `client/src/pages/games/ComplexitySort.tsx`
- `client/src/pages/games/StarRoleplay.tsx`
- `client/src/pages/games/TimeRush.tsx`
- `client/src/pages/games/DiagramLabeler.tsx`

# Files to modify (5)

- `server/prisma/schema.prisma` — 3 new models + enum extension
- `server/src/routes/coreSubject.ts` + `interviewService.ts` + `aiInterviewService.ts` — call `reportService.generateReport()` after each attempt is scored
- `client/src/App.tsx` — new page routes (`test-report`, new game routes)
- `client/src/pages/PipelinePage.tsx` — after stage completion, if `reportId` returned, offer "View report" chip

---

# Sprints

Each sprint should land: schema/data, service, route, UI, smoke test.

| # | Scope | Est |
|---|-------|-----|
| **1** | `TestReport` + `ConceptSynopsis` models; `reportService` + `synopsisService`; `concept-synopsis.md` prompt; `TestReport.tsx` component; wire post-quiz calls | 2-3 days |
| **2** | Game recommender + 3 MVP games (Complexity Sort, Time Rush, STAR Roleplay) | 2 days |
| **3** | `GameContent` model; Bug Hunt + Dry-Run games (with LLM content pipelines like existing MCQ audit) | 3-4 days |
| **4** | SQL Puzzle + Diagram Labeler (sql.js integration + SVG diagram JSON) | 3-4 days |
| **5** | Polish: pipeline integration (weak-concept synopses show as stage descriptions; game-play milestones auto-added), admin regenerate-synopsis route | 1-2 days |

---

# Critical Gotchas

Inherits everything in the base plan.md gotchas plus:

1. **Never call LLM synopsis in the hot path** — always `getOrGenerate` (cache-first). Report generation should fire synopsis calls in the background and let the client poll or WebSocket-stream.
2. **Sql.js is ~1MB** — dynamic-import it inside the SQL Puzzle page only, not the app shell. Loads on-demand.
3. **Bug Hunt / Dry-Run content must be pre-generated** — do NOT call LLM per play. Use the same content-pipeline pattern as `solve-and-verify.ts` — batch-generate ahead of time, cache in `GameContent`.
4. **Concept tagging must stay deterministic in v1** — do not add an LLM step in `reportService.generateReport()`. Use existing metadata. LLM-based concept tagging can come in v2 with careful caching.
5. **Groq's json mode + long prompts** — the synopsis prompt is short (< 1500 chars), safe. If we add long context-injection later, watch total tokens.
6. **Report can be recomputed** — if concept tagging changes, we can wipe and regenerate reports. Keep `sourceType` + `sourceId` on `TestReport` so regeneration is a simple `deleteMany + generate`.

---

# Key Design Decisions

1. **Reports are stored, synopses are cached** — a report is a snapshot of one attempt (must survive later changes to the underlying question). A synopsis is a general explanation of a concept (safe to share across attempts + users).
2. **One shared `TestReport.tsx`** — consistency > per-flow customization. Adds a new report type = add a case to the source loader in `reportService.ts`; UI is unchanged.
3. **Game recommender is deterministic** — no LLM. Concept → subject → weighted game picks. Auditable, no cost, fast.
4. **New games follow existing engine pattern** — each is a standalone `pages/games/X.tsx` component with `topicId` + `onComplete` props, just like MemoryMatch. No new routing/plumbing needed.
5. **LLM-generated game content is cached and human-reviewable** — Bug Hunt puzzles get stored in `GameContent` with a `verified: false` flag; add an admin review queue path like the existing MCQ audit.
6. **Reports are additive** — the existing per-flow result screens keep working. The `View comprehensive report` button is opt-in on each finish screen so we can ship incrementally.
