# Plan: Complete AI Interview System — HR + Technical + Coding + Learning Path

## Current State (What Already Exists)

| Module | Status | Data |
|--------|--------|------|
| AI Mock Interview | Done | 9 interviews taken, TTS avatar, rubric scoring (5 axes), proctoring, delivery signals |
| Aptitude Question Bank | Done | 470 MCQs (InterviewQuestion) + 32 theory notes + 868 handout questions (AssessmentQuestion) |
| Core Subject Bank (`data.json`) | **Data exists, not integrated** | 231 MCQs: CN(62), OS(59), DBMS(58), SQL(52) — with answers + explanations |
| Coding Infrastructure | Done | Piston sandbox, 123 problems, 16 DSA topics, run/submit/scratch endpoints, ProblemSolver UI |
| HR Questions | **Model exists, 0 rows** | `HrQuestion` table empty — user has now provided 155 questions |
| Company Profiles | Done | 13 companies (Amazon, Microsoft, TCS, etc.) with interview style profiles |
| Gamified Learning | Done | 7 game engines, XP, levels, streaks, 9 achievements, ranks |
| Company Readiness | Done | Placement Readiness Index per company |
| Mastery + Weakness | Done | Recency-weighted mastery, auto study plans |

---

## The Big Picture: Three Interview Rounds → One Learning Path

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERVIEW FLOW                               │
│                                                                 │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ 1. HR Round  │──▶│ 2. Technical │──▶│ 3. Coding Round  │    │
│  │ (behavioral) │   │ (core CS +   │   │ (live problem    │    │
│  │ STAR scoring │   │  resume-based)│   │  with proctoring)│    │
│  └──────┬──────┘   └──────┬───────┘   └──────┬───────────┘    │
│         │                  │                   │                │
│         ▼                  ▼                   ▼                │
│  ┌──────────────────────────────────────────────────┐          │
│  │         UNIFIED DIAGNOSIS ENGINE                  │          │
│  │  HR gaps (communication, STAR structure)          │          │
│  │  Technical gaps (OS, DBMS, CN, OOP from rubric)   │          │
│  │  Coding gaps (problem-solving, language, DSA)     │          │
│  └──────────────────────┬───────────────────────────┘          │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LEARNING PATH                                │
│                                                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Quests   │  │ Core CS   │  │ Coding   │  │ HR Practice  │  │
│  │ (topic   │  │ Quiz from │  │ Tracks   │  │ (STAR        │  │
│  │ mastery) │  │ data.json │  │ (DSA     │  │  builder)    │  │
│  │          │  │ bank      │  │  problems)│  │              │  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Prep Tracker: Radar + Quests + History + Readiness     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: HR Question Bank + STAR Scoring

### 1A. Seed 155 HR Questions

The user has provided 155 HR questions across 10 categories. Seed into the existing `HrQuestion` model (already in schema, 0 rows).

**Category mapping from the provided questions:**

| Category | Question Range | Count |
|----------|---------------|-------|
| intro | 1-5 | 5 |
| strengths-weaknesses | 6-10 | 5 |
| motivation | 11-20 | 10 |
| self-assessment | 21-25 | 5 |
| challenges | 26-30 | 5 |
| career-goals | 28-35 | 8 |
| work-style | 36-45 | 10 |
| teamwork | 46-55 | 10 |
| behavioral | 56-70 | 15 |
| fresher | 71-85 | 15 |
| resume-based | 86-100 | 15 |
| situational | 101-115 | 15 |
| company-career | 116-130 | 15 |
| personality | 131-145 | 15 |
| closing | 146-155 | 10 |

**Seed file**: `server/prisma/data/hr_questions.json`

Each question gets STAR guidance generated at seed time:

```json
{
  "question": "Tell me about a time you failed. What did you learn?",
  "category": "behavioral",
  "starGuidance": "**Situation**: Describe a specific failure — project, exam, deadline.\n**Task**: What were you responsible for?\n**Action**: What did you do wrong? What did you do to fix or recover?\n**Result**: What was the outcome? What lesson stuck with you?\n\n**Tips**: Be genuine. Interviewers want self-awareness, not a disguised strength. Keep it professional — avoid personal drama.",
  "sampleOutline": "- S: Led a 4-person team project; we missed the submission deadline\n- T: I was responsible for coordinating and integrating modules\n- A: I realized I hadn't set intermediate checkpoints. After that, I started using a simple task board\n- R: We submitted late with a penalty but the professor noted our improved process; I've used milestone tracking in every project since",
  "companyTags": ["infosys", "tcs", "wipro", "accenture"]
}
```

### 1B. HR Interview Mode in AI Interview

**Modify `aiInterviewService.ts`** to support an HR round type:

```typescript
// POST /ai-interview/start { role, companyId?, roundType: "hr" | "technical" | "full" }
```

When `roundType === "hr"`:
- Pull 6-8 HR questions from `HrQuestion` (filtered by company tags if companyId provided)
- Use a new `server/ai/prompts/hr-interviewer.md` prompt that:
  - Asks the HR questions conversationally
  - Probes shallow answers ("Can you give a specific example?")
  - Never asks technical questions

**New scorer prompt** `server/ai/prompts/hr-scorer.md`:

Scores on HR-specific rubric:
```
{
  "starStructure": 0-5,    // Did answers follow STAR? Were they specific?
  "communication": 0-5,    // Clarity, conciseness, confidence
  "selfAwareness": 0-5,    // Genuine weaknesses, realistic self-assessment
  "cultureFit": 0-5,       // Alignment with company values, enthusiasm
  "professionalism": 0-5,  // Maturity, positive framing, no badmouthing
}
```

**STAR-based output**: For each candidate turn, the scorer outputs:
```json
{
  "turnOrder": 3,
  "score": 3.5,
  "starBreakdown": {
    "situation": { "present": true, "quality": "good" },
    "task": { "present": true, "quality": "vague" },
    "action": { "present": false, "quality": "missing" },
    "result": { "present": true, "quality": "good" }
  },
  "feedback": "Good situation setup but you skipped what YOU specifically did. Add the Action step.",
  "improvedAnswer": "Here's how to restructure: ..."
}
```

### 1C. Schema Changes

```prisma
model AiInterview {
  // ... existing fields ...
  roundType        String   @default("technical") // "hr" | "technical" | "coding" | "full"
  resumeData       Json?    // extracted resume skills/projects/experience
  selectedQuestionIds String[] @default([])
  diagnosis        InterviewDiagnosis?
}
```

---

## Phase 2: Resume-Aware Technical Interview

### 2A. Resume Upload + Parsing

**New endpoint**: `POST /ai-interview/upload-resume`

Flow:
1. User uploads resume (PDF) before starting the interview
2. Server extracts text using `pdf-parse` (already in npm ecosystem)
3. LLM call to extract structured data:

```
Extract from this resume:
{{resumeText}}

Return JSON:
{
  "name": "...",
  "skills": ["Python", "React", "SQL", ...],
  "projects": [
    { "title": "...", "tech": ["React", "Node"], "description": "..." }
  ],
  "internships": [
    { "company": "...", "role": "...", "duration": "...", "highlights": ["..."] }
  ],
  "education": { "degree": "...", "branch": "...", "college": "..." },
  "certifications": ["..."],
  "achievements": ["..."]
}
```

4. Store parsed data in `AiInterview.resumeData`

### 2B. Resume-Driven Question Generation

**Modify `server/ai/prompts/interviewer.md`** when resume data is present:

```markdown
The candidate's resume shows:
- Skills: {{skills}}
- Projects: {{projectSummaries}}
- Internship at {{internshipCompany}}: {{internshipHighlights}}

Use this to:
1. Ask about their projects: "You built {{projectTitle}} — walk me through the architecture"
2. Probe claimed skills: "You listed {{skill}} — {{technical question about that skill}}"
3. Cross-reference experience: "In your internship at {{company}}, you said {{highlight}} — how did you handle {{related challenge}}?"
4. Mix in core CS questions relevant to their tech stack
```

This means 2-3 of the 6 questions come from the resume, rest from the core question bank.

### 2C. Core Subject Technical Questions (from `data.json`)

**Seed `data.json` into a new model or the existing `AssessmentQuestion` table.**

Better approach: **new model `CoreSubjectQuestion`** (simpler than AssessmentQuestion, no options table needed):

```prisma
model CoreSubjectQuestion {
  id          String   @id @default(uuid())
  subject     String   // "CN", "OS", "DBMS", "SQL"
  question    String
  options     Json     // string[] — 4 options
  answerIndex Int      // 0-indexed correct answer
  explanation String
  difficulty  String   @default("medium")
  tags        String[] @default([])
  createdAt   DateTime @default(now())

  @@index([subject])
}
```

**Seed**: Read `data.json`, create 231 rows.

**Two uses**:
1. **In AI interview (technical round)**: The interviewer prompt gets 2-3 core subject questions injected as conversation starters. The AI doesn't show MCQ options — it asks the question verbally and the candidate explains. Scoring judges depth of understanding.
2. **Standalone quiz mode**: A new "Core CS Quiz" feature (like the existing InterviewQuiz) where users can drill CN/OS/DBMS/SQL questions directly.

### 2D. Technical Interview Prompt (`server/ai/prompts/technical-interviewer.md`)

```markdown
You are a technical interviewer at {{company}} for the role {{role}}.

The candidate's resume: {{resumeSummary}}
Core subject questions to weave in: {{coreQuestions}}

Interview arc (6 questions):
1. Resume warmup: "Tell me about your {{project}} project"
2. Resume probe: "You used {{tech}} — {{deep question about it}}"
3. Core CS (OS/DBMS/CN): Pick from the injected questions, ask conversationally
4. Core CS: Another subject area
5. DSA/Problem-solving: Describe a problem, ask them to think through an approach
6. System design lite / closing technical question

Adapt difficulty based on their resume level (fresher vs. experienced).
```

---

## Phase 3: Coding Interview Round

### 3A. `CodingInterviewRoom.tsx` — New Full-Screen Page

A dedicated coding interview page that combines:
- **Left panel**: Problem statement (from `CodingProblem` table)
- **Right panel**: Code editor (existing `<textarea>` approach from ProblemSolver, or integrate Monaco/CodeMirror)
- **Top bar**: Timer, language selector, camera feed, mic status
- **Bottom panel**: Run output, test case results

**Proctoring** (reuse existing hooks):
- `useCameraStream` — camera feed in corner
- `useFacePresence` — face detection events
- `useQuizIntegrity` — tab-switch, copy-paste detection

**Voice check** (reuse existing STT):
- Optional: candidate can explain their approach verbally
- STT captures their thinking process
- Stored as delivery signals (like existing InterviewRoom)

### 3B. Coding Interview Flow

```
1. Problem Selection
   - Company-tagged problems from CodingProblem (e.g. "amazon" tagged problems)
   - OR random by difficulty + topic
   - 1-2 problems per coding round (30-45 min timer)

2. Live Coding
   - User writes code in editor
   - Run against sample test cases (visible output)
   - Submit against hidden test cases (verdict only)
   - Timer ticking in top bar

3. Code Review by AI
   - After submit or time's up, the LLM reviews:
     - Code quality (naming, structure, edge cases)
     - Time/space complexity analysis
     - Alternative approaches
     - What the candidate got right vs. missed

4. Results
   - Test case pass rate
   - AI code review feedback
   - Complexity analysis
   - Proctoring summary
```

### 3C. New Endpoint

```
POST /ai-interview/start { role, companyId?, roundType: "coding" }
```

Creates an `AiInterview` with `roundType: "coding"`, links to 1-2 selected `CodingProblem` IDs.

### 3D. Coding Scorer Prompt (`server/ai/prompts/coding-scorer.md`)

```markdown
Review this candidate's code submission:

Problem: {{problemStatement}}
Language: {{language}}
Code: {{submittedCode}}
Test results: {{passed}}/{{total}} passed
Time taken: {{elapsedMinutes}} minutes

Score (0-5 each):
{
  "correctness": ...,      // Did it pass test cases?
  "codeQuality": ...,      // Clean, readable, well-structured?
  "efficiency": ...,       // Optimal time/space complexity?
  "edgeCases": ...,        // Handled nulls, empty inputs, overflow?
  "problemSolving": ...,   // Good approach? Or brute-force only?
}

Also provide:
{
  "complexityAnalysis": { "time": "O(n log n)", "space": "O(n)" },
  "alternativeApproach": "Could use a two-pointer technique instead...",
  "feedback": "..."
}
```

### 3E. Schema Addition

```prisma
model AiInterviewCodingSubmission {
  id            String   @id @default(uuid())
  interviewId   String
  interview     AiInterview @relation(fields: [interviewId], references: [id])
  problemId     String
  problem       CodingProblem @relation(fields: [problemId], references: [id])
  language      String
  code          String
  testsPassed   Int      @default(0)
  testsTotal    Int      @default(0)
  score         Float?   // 0-100
  aiReview      Json?    // LLM code review output
  elapsedSec    Int      @default(0)
  submittedAt   DateTime @default(now())
}
```

---

## Phase 4: Unified Diagnosis + Gap Mapping

### 4A. `InterviewDiagnosis` Model (expanded)

```prisma
model InterviewDiagnosis {
  id              String   @id @default(uuid())
  interviewId     String   @unique
  interview       AiInterview @relation(fields: [interviewId], references: [id])

  // HR diagnosis
  hrWeakAreas     Json?    // [{ area: "STAR structure", score: 2, advice: "..." }]
  starScores      Json?    // per-turn STAR breakdown

  // Technical diagnosis
  techWeakAreas   Json?    // [{ subject: "OS", topic: "process scheduling", score: 2 }]
  techStrongAreas Json?    // [{ subject: "DSA", topic: "arrays", score: 4.5 }]
  topicMapping    Json?    // maps gaps → InterviewTopic/Domain/Topic IDs

  // Coding diagnosis
  codingWeakAreas Json?    // [{ area: "edge cases", score: 2 }, { area: "complexity", score: 1.5 }]
  codingTopics    Json?    // [{ topic: "dynamic-programming", needsPractice: true }]

  overallVerdict  String   // "needs-practice" | "almost-ready" | "interview-ready"
  createdAt       DateTime @default(now())
}
```

### 4B. Diagnosis Service (expanded)

After any round type finishes:

```typescript
async function diagnoseInterview(interviewId: string) {
  const interview = await loadInterview(interviewId);

  switch (interview.roundType) {
    case 'hr':
      // Analyze STAR structure gaps, communication weaknesses
      // Map to HR practice quests
      break;
    case 'technical':
      // Map technical gaps to core subject topics (CN/OS/DBMS/SQL)
      // Map to quiz + theory quests
      break;
    case 'coding':
      // Analyze coding submission weaknesses
      // Map to DSA topic tracks + specific problems
      break;
    case 'full':
      // Combine all three
      break;
  }
}
```

### 4C. Gap → Topic Mapping (deterministic + LLM)

```typescript
const TECH_GAP_MAP: Record<string, { subject: string; topics: string[] }> = {
  'operating system':    { subject: 'OS',   topics: ['process-scheduling', 'memory-management', 'deadlocks', 'file-systems'] },
  'process':             { subject: 'OS',   topics: ['process-scheduling', 'inter-process-communication'] },
  'memory':              { subject: 'OS',   topics: ['memory-management', 'virtual-memory', 'paging'] },
  'database':            { subject: 'DBMS', topics: ['normalization', 'transactions', 'indexing'] },
  'sql':                 { subject: 'SQL',  topics: ['joins', 'subqueries', 'aggregation'] },
  'network':             { subject: 'CN',   topics: ['osi-model', 'tcp-udp', 'routing'] },
  'data structure':      { subject: 'DSA',  topics: ['arrays', 'linked-lists', 'trees', 'graphs'] },
  'object oriented':     { subject: 'OOP',  topics: ['inheritance', 'polymorphism', 'design-patterns'] },
  'system design':       { subject: 'SD',   topics: ['load-balancing', 'caching', 'database-sharding'] },
};

const HR_GAP_MAP: Record<string, string[]> = {
  'star structure':    ['practice structuring answers with Situation-Task-Action-Result'],
  'self awareness':    ['prepare genuine weakness + improvement plan', 'practice self-reflection questions'],
  'communication':     ['practice concise 60-second answers', 'eliminate filler words'],
  'specific examples': ['prepare 5-6 STAR stories covering different themes'],
  'company research':  ['research company values, recent news, products'],
};
```

---

## Phase 5: Quest System (from previous plan — enhanced)

Same as previous plan's Phase 3, but now quests are generated from ALL three round types:

**HR Quest Example:**
```
Quest: "Strengthen Your STAR Stories"
Milestones:
  1. Read the STAR method theory guide
  2. Practice 3 HR questions from the "behavioral" category
  3. Record yourself answering (voice mode) and review filler count
  4. Retake HR round and score 3.5+ on starStructure
```

**Technical Quest Example:**
```
Quest: "Master OS Fundamentals"
Milestones:
  1. Read OS theory notes (InterviewTheory)
  2. Score 70%+ on OS quiz (from data.json bank)
  3. Play Memory Match on OS topic
  4. Retake technical round and score 3.5+ on OS questions
```

**Coding Quest Example:**
```
Quest: "Level Up Dynamic Programming"
Milestones:
  1. Solve 3 Easy DP problems from CodingProblem bank
  2. Solve 1 Medium DP problem
  3. Complete a coding round with a DP problem scoring 70%+
```

---

## Phase 6: Full Interview Mode ("Mock Placement Drive")

A combined flow that simulates a real placement process:

```
┌──────────────────────────────────────────────────────────────┐
│  MOCK PLACEMENT DRIVE                                        │
│                                                              │
│  Step 1: Upload Resume ──────────────────────────────┐      │
│  Step 2: HR Round (15 min, 6 questions) ─────────────┤      │
│  Step 3: Technical Round (20 min, 6 questions) ──────┤      │
│  Step 4: Coding Round (30 min, 1-2 problems) ────────┤      │
│                                                      ▼      │
│  Step 5: Unified Report ─────────────────────────────┐      │
│    - HR STAR scorecard                               │      │
│    - Technical rubric radar                          │      │
│    - Coding pass rate + AI review                    │      │
│    - Overall verdict + learning path                 │      │
│    - Comparison with previous attempts               │      │
│                                                      ▼      │
│  Step 6: Auto-generated Quests ──────────────────────       │
└──────────────────────────────────────────────────────────────┘
```

### 6A. Full Mode Schema

```prisma
model PlacementDrive {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  companyId     String?
  company       Company? @relation(fields: [companyId], references: [id])
  resumeData    Json?
  status        String   @default("IN_PROGRESS") // IN_PROGRESS | COMPLETED
  currentRound  String   @default("resume") // resume | hr | technical | coding | report
  hrInterviewId     String? // links to AiInterview with roundType=hr
  techInterviewId   String? // links to AiInterview with roundType=technical
  codingInterviewId String? // links to AiInterview with roundType=coding
  overallScore  Float?
  overallReport Json?    // combined report from all rounds
  startedAt     DateTime @default(now())
  completedAt   DateTime?
}
```

### 6B. PlacementDrive Flow API

```
POST   /placement-drive/start { companyId? }          → creates drive, goes to resume step
POST   /placement-drive/:id/upload-resume             → parses resume, advances to HR
POST   /placement-drive/:id/start-round { round }     → starts the next AiInterview
POST   /placement-drive/:id/complete                  → generates unified report
GET    /placement-drive/:id                           → full drive state + report
GET    /placement-drive/history                       → past drives
```

---

## Phase 7: Prep Tracker Dashboard (expanded)

### 7A. `PrepTracker.tsx` — Sections

**Section 1 — Skill Radar (3 overlays)**
- HR axis: avg of (starStructure, communication, selfAwareness, cultureFit, professionalism)
- Technical axes: OS, DBMS, CN, DSA, OOP (from technical round rubric + core subject quiz scores)
- Coding axis: avg of (correctness, codeQuality, efficiency, edgeCases, problemSolving)
- Overlay: first attempt vs. latest (shows improvement)

**Section 2 — Active Quests**
(same as previous plan)

**Section 3 — Round-by-Round History**
- Tabbed: HR | Technical | Coding | Full Drive
- Each tab shows chronological list with scores and trend

**Section 4 — Core CS Mastery Heatmap**
- Grid: CN | OS | DBMS | SQL columns
- Rows: individual topics from data.json
- Color: red (not attempted) → yellow (< 70%) → green (> 70%)
- Clickable: opens quiz for that topic

**Section 5 — Readiness Meter (expanded formula)**
```
Readiness = (hr_avg * 0.15)
           + (technical_avg * 0.25)
           + (core_cs_quiz_avg * 0.15)
           + (coding_avg * 0.20)
           + (quest_completion * 0.15)
           + (streak_bonus * 0.10)
```

**Section 6 — Streak Calendar + Daily Recommendations**
(same as previous plan)

---

## Phase 8: Gamification (expanded)

### 8A. XP Rules

```typescript
// HR Round
hr_round_completed:         50,
hr_star_perfect:           100,   // all turns scored 4+ on STAR
hr_no_fillers:              75,   // 0 filler words in voice mode

// Technical Round
tech_round_completed:       50,
tech_score_bonus:           20,   // per rubric point above 3.0
core_cs_quiz_perfect:      100,   // 100% on a subject quiz

// Coding Round
coding_round_completed:     50,
coding_all_passed:         200,   // all test cases passed
coding_optimal:            150,   // AI confirmed optimal complexity

// Full Drive
placement_drive_completed: 200,
drive_improvement:         250,   // overall score improved 15%+

// Quests (same as before)
quest_milestone_complete:   50,
quest_complete:            200,
quest_complete_early:      100,
```

### 8B. New Achievements (20 total)

| Slug | Name | Trigger | XP |
|------|------|---------|-----|
| `ice-breaker` | Ice Breaker | Complete first AI interview (any round) | 100 |
| `star-storyteller` | STAR Storyteller | Score 4+ on starStructure in HR round | 200 |
| `no-ums` | No Ums! | Complete a voice interview with 0 filler words | 150 |
| `hr-natural` | HR Natural | Score 4+ overall in HR round | 250 |
| `tech-solid` | Tech Solid | Score 4+ overall in technical round | 300 |
| `resume-warrior` | Resume Warrior | Complete interview using resume-based questions | 150 |
| `os-master` | OS Master | Score 90%+ on OS quiz (data.json bank) | 200 |
| `dbms-master` | DBMS Master | Score 90%+ on DBMS quiz | 200 |
| `cn-master` | CN Master | Score 90%+ on CN quiz | 200 |
| `sql-master` | SQL Master | Score 90%+ on SQL quiz | 200 |
| `code-ace` | Code Ace | Pass all test cases in coding round | 300 |
| `optimal-solver` | Optimal Solver | AI confirms optimal complexity in coding round | 250 |
| `comeback-kid` | Comeback Kid | Improve overall score by 20%+ on retake | 250 |
| `quest-master` | Quest Master | Complete 5 quests | 500 |
| `speed-learner` | Speed Learner | Complete a quest before deadline | 200 |
| `full-drive` | Full Drive | Complete a full mock placement drive | 400 |
| `drive-ace` | Drive Ace | Score 80+ overall on a full drive | 500 |
| `streak-scholar` | Streak Scholar | 14-day prep streak | 300 |
| `mock-veteran` | Mock Veteran | Complete 10 interviews (any type) | 500 |
| `company-ready` | Company Ready | Readiness score 80+ for any company | 350 |

### 8C. Interview Track Ranks

| XP Range | Rank |
|----------|------|
| 0-499 | Nervous Newbie |
| 500-1499 | Practice Enthusiast |
| 1500-3499 | Confident Candidate |
| 3500-6999 | Sharp Interviewee |
| 7000-11999 | Mock Interview Pro |
| 12000+ | Placement Ready |

---

## Data Requirements Summary

| Data | Source | Count | Status |
|------|--------|-------|--------|
| HR Questions | User-provided (above) | 155 | **Ready — need to seed** |
| STAR Guidance per HR Q | LLM-generated at seed time | 155 | **Generate during seed** |
| Core CS MCQs | `capstone/data.json` | 231 (CN:62, OS:59, DBMS:58, SQL:52) | **Ready — need to seed into new table** |
| Resume parsing | `pdf-parse` npm package | N/A | **Install package** |
| Coding problems | Already in DB | 123 | Done |
| Company profiles | Already in DB | 13 | Done |
| Interview prompts | Write new `.md` files | 4 new | **Write** |
| Achievements | Seed data | 20 | **Write seed** |

---

## Implementation Order

```
Sprint 1 (2-3 days): HR Round + Data Seeding
  1. Seed 155 HR questions with STAR guidance into HrQuestion table
  2. Seed 231 core CS questions from data.json into CoreSubjectQuestion table
  3. Create hr-interviewer.md and hr-scorer.md prompts
  4. Add roundType to AiInterview, handle HR flow in aiInterviewService
  5. Build STAR scorecard output in finishInterview for HR rounds
  6. Frontend: Add "HR Round" option to InterviewHome

Sprint 2 (2-3 days): Resume-Aware Technical Round
  7. Add resume upload endpoint + PDF parsing (pdf-parse)
  8. Create technical-interviewer.md prompt with resume injection
  9. Modify startInterview to inject resume data + core CS questions
  10. Build resume upload UI in InterviewRoom pre-interview consent screen
  11. Frontend: Show resume-based question highlights in interview report

Sprint 3 (3-4 days): Coding Interview Round
  12. Create CodingInterviewRoom.tsx (split-pane: problem + editor)
  13. Integrate camera (useCameraStream) + proctoring (useFacePresence)
  14. Wire to existing /code/run and /code/submit endpoints
  15. Create coding-scorer.md prompt for AI code review
  16. Add AiInterviewCodingSubmission model + migration
  17. Build coding round report card (pass rate + AI review + complexity)

Sprint 4 (2-3 days): Diagnosis + Quest System
  18. Add InterviewDiagnosis model + migration
  19. Build diagnosisService.ts (handles all 3 round types)
  20. Build questService.ts (quest generation from diagnosis)
  21. Add milestone auto-completion hooks
  22. Add PrepQuest + QuestMilestone models

Sprint 5 (2-3 days): Full Drive + Prep Tracker
  23. Add PlacementDrive model + flow API
  24. Build PlacementDriveFlow.tsx (multi-step wizard)
  25. Build PrepTracker.tsx (radar + quests + history + readiness)
  26. Build CoreCSQuiz.tsx (standalone quiz from data.json bank)
  27. Wire readiness formula

Sprint 6 (1-2 days): Gamification + Polish
  28. Add interview XP rules to xpService.ts
  29. Seed 20 achievements
  30. Add interview rank track
  31. Build recommendationService.ts
  32. End-to-end test all flows
```

---

## File Changes Summary

### New Files (18)

| File | Purpose |
|------|---------|
| `server/prisma/data/hr_questions.json` | 155 HR questions with STAR guidance |
| `server/ai/prompts/hr-interviewer.md` | HR round interviewer prompt |
| `server/ai/prompts/hr-scorer.md` | HR STAR-based scoring rubric |
| `server/ai/prompts/technical-interviewer.md` | Resume-aware technical interviewer |
| `server/ai/prompts/coding-scorer.md` | Coding round AI review prompt |
| `server/ai/prompts/diagnosis.md` | Gap analysis prompt |
| `server/src/services/resumeService.ts` | PDF parsing + LLM extraction |
| `server/src/services/diagnosisService.ts` | Post-interview gap mapping |
| `server/src/services/questService.ts` | Quest generation + milestone tracking |
| `server/src/services/recommendationService.ts` | Daily smart recommendations |
| `server/src/routes/prepTracker.ts` | Prep tracker API endpoints |
| `server/src/routes/placementDrive.ts` | Full drive flow endpoints |
| `client/src/pages/CodingInterviewRoom.tsx` | Coding interview with camera + editor |
| `client/src/pages/PrepTracker.tsx` | Preparation dashboard |
| `client/src/pages/PlacementDriveFlow.tsx` | Multi-round drive wizard |
| `client/src/pages/CoreCSQuiz.tsx` | Standalone CN/OS/DBMS/SQL quiz |
| `client/src/components/SkillRadar.tsx` | Radar chart component |
| `client/src/components/StreakCalendar.tsx` | Activity heatmap |

### Modified Files (10)

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add CoreSubjectQuestion, InterviewDiagnosis, PrepQuest, QuestMilestone, AiInterviewCodingSubmission, PlacementDrive; modify AiInterview |
| `server/prisma/seed.ts` | Seed HR questions + core CS questions + new achievements |
| `server/src/services/aiInterviewService.ts` | Support roundType (hr/technical/coding), resume injection, core CS injection |
| `server/ai/prompts/interviewer.md` | Add resume + real question injection blocks |
| `server/src/services/xpService.ts` | Add interview/HR/coding XP rules |
| `server/src/services/achievementService.ts` | Add 20 interview achievement conditions |
| `server/src/index.ts` | Register prepTracker + placementDrive routes |
| `client/src/App.tsx` | Add new page routing |
| `client/src/pages/InterviewHome.tsx` | Add HR Round, Coding Round, Full Drive, Prep Tracker cards |
| `client/src/pages/InterviewRoom.tsx` | Add resume upload to consent screen |

---

## Key Design Decisions

1. **Three separate round types, not one monolithic interview**: HR, Technical, and Coding rounds have fundamentally different scoring rubrics, question sources, and UIs. Separate `roundType` keeps each focused.

2. **Resume is parsed once, reused across rounds**: The extracted resume data is stored on the `AiInterview` row. Technical rounds use it for question generation; HR rounds use it for "walk me through your resume" questions; coding rounds can use claimed skills to select relevant problems.

3. **Core CS questions from data.json serve dual purpose**: (a) Injected into technical interviews as conversational questions, (b) Available as standalone quiz mode for direct practice. Same 231 questions, two consumption modes.

4. **STAR scoring is per-turn, not just overall**: Each HR answer gets a `starBreakdown` showing which STAR components were present/missing. This gives actionable feedback ("You had a great Situation but skipped the Action step").

5. **Coding round reuses existing infrastructure**: Piston sandbox, `CodingProblem` table, `runAgainstCases` — all already working. The coding interview just adds a timer, camera overlay, and AI code review on top.

6. **PlacementDrive is a container, not a new interview type**: It orchestrates 3 separate `AiInterview` rows (one per round) and produces a unified report. This means each round's scoring logic stays independent and testable.

7. **Diagnosis adapts to round type**: An HR diagnosis maps to STAR practice quests. A technical diagnosis maps to core CS quizzes. A coding diagnosis maps to DSA track problems. The quest system is the unifier.

8. **155 HR questions are seeded with pre-generated STAR guidance**: Rather than generating guidance at runtime (slow, costs LLM tokens every time), we generate it once during seed and store it. The guidance is static — the same question always has the same STAR template.

---

# Plan Addendum: Personalized Learning Pipeline (First-Login Diagnostic)

## The Problem

New users land cold on a Dashboard with 8+ modules (Aptitude, Coding Tracks, Core CS, HR, AI Interview, Placement Drive, Contests, Quest Hub, Prep Tracker). No direction. The existing weakness detector (`weaknessDetector.ts`) and quest generator (`diagnosisService.ts`) both need **prior activity** to produce output — a brand-new user has zero data, so both are silent. Users pick modules at random, get feedback that doesn't stitch together, and drop off.

## The Fix — Three Pieces

1. **First-login diagnostic**: a 25-question ~20 min mixed test the user takes before hitting the main app. Blocks the Dashboard until submitted (with a "skip for now" escape hatch — never trap users).
2. **Skill profile**: one `UserSkillProfile` row per user with per-pillar levels (1-5) + an overall belt (Bronze → Diamond). Populated by the diagnostic, refreshed by later activity.
3. **Learning pipeline**: an ordered, gated `LearningPipeline` of stages generated from the profile. Each stage unlocks the next when its gate passes (quiz ≥ 80%, N coding problems solved, mock interview ≥ 3.5, etc.).

The pipeline **replaces the Dashboard as the default post-login landing page**. Users can still navigate anywhere via the sidebar — the pipeline just becomes the strongly-suggested next thing.

## The Four Pillars (map to already-seeded data)

| Pillar | Diagnostic source | Bank size |
|--------|-------------------|-----------|
| Aptitude | `InterviewQuestion` (Quant / Logical / Verbal) | 470 rows |
| Core CS | `CoreSubjectQuestion` (CN / OS / DBMS / SQL) | 231 rows |
| Coding | `CodingProblem` (EASY / MEDIUM / HARD) | 123 rows |
| Communication | Not diagnosed at first login — grows from `AiInterview.rubricScores.communication` over time | (no seed) |

## Diagnostic Test Design (25 questions, ~20 min)

Deliberately short — placement students hate onboarding walls. Mix:

- **6 aptitude** (2 Quant + 2 Logical + 2 Verbal), medium difficulty
- **8 core CS** (2 each from CN / OS / DBMS / SQL), medium difficulty
- **1 coding problem** (EASY, 15-min hard cap, samples visible, hidden tests hidden)
- **10 adaptive follow-ups**: after every 3 base questions, the next question's difficulty flips based on running accuracy — hard if ≥ 66%, easy if ≤ 33%, medium otherwise. Simpler than true CAT (item response theory), good enough to distinguish strong from weak.

Each MCQ has a 60-second timer. Coding problem has its own 15-min timer (reuses existing Piston + `runAgainstCases`). Timeouts count as wrong, not fatal.

## Level Computation (deterministic — no LLM)

After submit, per pillar:
- `accuracy = correct / attempted`  (coding contributes as `passedTests / totalTests`)
- `speed = 1 - min(1, totalTime / expectedTime)`
- `score = 0.75 * accuracy + 0.25 * speed`

Map score → level:
| Score | Level | Label |
|-------|-------|-------|
| < 0.30 | 1 | Foundations |
| 0.30-0.50 | 2 | Novice |
| 0.50-0.70 | 3 | Intermediate |
| 0.70-0.85 | 4 | Proficient |
| ≥ 0.85 | 5 | Advanced |

**Overall belt** = rounded avg of the 3 diagnosed pillars:
- avg ≤ 1.5 → **Bronze** · ≤ 2.5 → **Silver** · ≤ 3.5 → **Gold** · ≤ 4.5 → **Platinum** · > 4.5 → **Diamond**

Communication starts at level 1 for everyone (or level 3 if user self-reports "confident speaker" in a one-question intake). It grows from AI interview `communication` rubric scores.

## Models

```prisma
model UserSkillProfile {
  id             String    @id @default(uuid())
  userId         String    @unique
  user           User      @relation(fields: [userId], references: [id])
  aptitudeLevel  Int       @default(0)   // 0 = not yet diagnosed
  coreCSLevel    Int       @default(0)
  codingLevel    Int       @default(0)
  commLevel      Int       @default(1)
  overallBelt    String    @default("Unranked") // Unranked / Bronze / Silver / Gold / Platinum / Diamond
  breakdown      Json?     // per-subtopic: { "CN": 3, "OS": 2, "Arrays": 4, ... }
  diagnosticAt   DateTime? // when first diagnostic completed (null = never)
  lastRefreshAt  DateTime? // most recent recomputation
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

// Snapshot of a single diagnostic sitting. Kept for audit + so re-taking
// creates a new row rather than mutating history.
model DiagnosticAttempt {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  startedAt    DateTime @default(now())
  submittedAt  DateTime?
  status       String   @default("IN_PROGRESS") // IN_PROGRESS / SUBMITTED / EXPIRED
  itemsSnapshot Json    // frozen question list at start
  responses    Json     // { qId: { chosenIndex, correct, timeMs } }
  perPillarScores Json? // { aptitude: 0.72, coreCS: 0.55, coding: 0.30 }
  levelsAwarded   Json? // { aptitude: 4, coreCS: 3, coding: 2 }

  @@index([userId, status])
}

model LearningPipeline {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  status        String   @default("ACTIVE") // ACTIVE / COMPLETED / PAUSED
  focus         String   @default("balanced") // "balanced" | "placement-6w" | "coding-only" — user's chosen preset
  targetCompany String?  // optional slug — biases stage selection
  createdAt     DateTime @default(now())
  completedAt   DateTime?

  stages        PipelineStage[]

  @@index([userId, status])
}

model PipelineStage {
  id           String   @id @default(uuid())
  pipelineId   String
  pipeline     LearningPipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  order        Int      // 1..N
  pillar       String   // "aptitude" | "coreCS" | "coding" | "comm"
  level        Int      // target level this stage moves the user toward (1-5)
  title        String   // "Master Percentages" / "OS Fundamentals" / "Arrays L1"
  description  String
  gateType     String   // "quiz" | "coding-solve" | "interview" | "theory-read"
  gateMeta     Json     // { topicSlug, minScore, questionCount } or { problemIds } etc.
  isUnlocked   Boolean  @default(false) // true once previous stage is completed
  isCompleted  Boolean  @default(false)
  completedAt  DateTime?

  @@unique([pipelineId, order])
  @@index([pipelineId, isCompleted])
}
```

## Pipeline Generation Algorithm

Given a `UserSkillProfile`, generate ~15-20 stages:

1. **Foundations first** — for each pillar with level < 3, add a theory-read + quiz stage targeting the weakest sub-topic (from `breakdown`).
2. **Level-up gates** — for each pillar, add stages that move the user up one level (level 2 → 3, then 3 → 4, etc.), stopping at the user's target (default: level 4).
3. **Cross-pillar milestones** — every ~5 stages, insert:
   - A mock AI interview (HR round after aptitude foundations, technical after core CS foundations, coding after coding L2)
   - A placement-style drill (short mixed test)
4. **Order by dependency + user's target company** — coding stays interleaved (people burn out doing pure DSA); if `targetCompany` is set, weight its known-weak-for-you topics higher.

**Preset packs** (user picks at pipeline-creation time):
- **Balanced (default)**: touches all 4 pillars, ~15 stages, ~4 weeks at 1 stage/day
- **Placement 6-week sprint**: dense mix, ~20 stages, ~6 weeks, ends in a Full Placement Drive
- **Coding-only**: 15 stages from `CodingProblem` topic tracks, mostly DSA, ends in a coding-round mock

## Gate Types (auto-completion hooks)

| Gate | Passes when |
|------|-------------|
| `quiz` | user submits a quiz on the target topic scoring ≥ `minScore` (default 70) |
| `coding-solve` | user marks N problems SOLVED (`UserProblemStatus.status = SOLVED`) matching `gateMeta.problemIds` or `gateMeta.topicSlug` |
| `interview` | user completes an `AiInterview` with matching `roundType` and `overallScore ≥ minScore` |
| `theory-read` | user opens the theory page for the target topic (records a `TheoryRead` event — new tiny model or reuse `UserInterviewProgress.lastPlayedAt`) |

Gates are checked by the same hooks that already fire for XP/achievements (in `submitInterviewQuiz`, `/code/submit`, `finishInterview`, etc.). One helper `checkPipelineGates(userId, event)` walks unlocked-but-incomplete stages, evaluates gates, marks completed stages, unlocks the next one, awards XP.

## UI

**New page: `PipelinePage.tsx`** — becomes the default post-login landing for users with an active pipeline. Shows:

- Header: `Bronze Belt · 3/18 stages · 15% complete` with a horizontal snake-path visualization
- Current stage card (large, front-and-center): title, description, gate condition, big "Start" CTA that deep-links to the target page (quiz / coding problem / mock interview)
- Next 2-3 upcoming stages (dimmed, locked)
- Completed stages collapsed into a strip at the top

**New page: `DiagnosticTest.tsx`** — the 25-question sitting. Full-screen, one question at a time, 60-sec timer, progress dots, no back button (prevents cheesing adaptive difficulty). Coding stage embeds the existing `ProblemSolver` in a modal.

**Modified: `App.tsx`** — new post-login guard:
```
if (auth.user && !skillProfile) → redirect to /diagnostic-intro (offer to take it or skip)
else if (auth.user && activePipeline) → default to /pipeline instead of /dashboard
```

**Modified: `Dashboard.tsx`** — add a "Your Pipeline" card at the top showing current-stage summary, since Dashboard is still reachable via nav.

**Sidebar** ([LeftNav.tsx](capstone/client/src/components/LeftNav.tsx)) — add "🎯 My Pipeline" as first item under PREP.

## API Surface

```
POST   /diagnostic/start                 → create DiagnosticAttempt, return frozen question set
POST   /diagnostic/:id/submit            → grade, create/update UserSkillProfile, auto-create LearningPipeline
GET    /skill-profile                    → current UserSkillProfile (or null)
POST   /pipeline/create                  → { focus, targetCompany? } — generates stages
GET    /pipeline/current                 → active pipeline with stages
POST   /pipeline/:id/refresh             → regenerate remaining stages from current profile (user-triggered)
POST   /pipeline/:id/skip-stage/:stageId → mark stage skipped (allows non-linear escape)
```

## Interaction With Existing Systems

Nothing gets ripped out — the pipeline **layers on top**:

| Existing | New role |
|----------|----------|
| `UserQuest` | Kept for diagnosis-driven quests spawned from an AI interview. Pipeline stages and quests can coexist — quests are reactive (triggered by an interview result), pipeline is proactive (planned from the start). |
| `MasteryScore` | Refreshed by pipeline gate completions. Level recompute reads from here. |
| `StudyPlan` | Becomes redundant for new users. Kept for backward compat + as a data source for pipeline generation ("you already flagged these topics as weak"). |
| `xpService.ts` | Pipeline gate completions award XP via `awardXp` — pipeline-specific rules to add: `pipeline_stage_complete: 100`, `pipeline_completed: 1000`. |
| `PrepTracker` | Add a new section showing pipeline progress alongside interview radar. |
| Achievements | New: `first_diagnostic`, `bronze_belt`, `silver_belt`, `gold_belt`, `platinum_belt`, `diamond_belt`, `pipeline_finisher`. |

## Data Requirements (verify before Sprint)

- All 4 pillars need diagnostic-eligible questions with correct answers — **already seeded**:
  - Aptitude: 470 in `InterviewQuestion` ✓
  - Core CS: 231 in `CoreSubjectQuestion` ✓
  - Coding: 123 in `CodingProblem` (need at least a few EASY with reliable hidden tests) ✓
- No new external data required.

## Sprints

**Sprint A — Diagnostic backend + storage (2 days)**
- Schema: `UserSkillProfile`, `DiagnosticAttempt`, `LearningPipeline`, `PipelineStage` — `npx prisma db push` (never migrate dev)
- `diagnosticService.ts`: `startDiagnostic`, `submitDiagnostic`, `computeLevels`
- Route: `/diagnostic/*` and `/skill-profile`
- Seed helper: precompiled item-selection function pulling from the 3 banks

**Sprint B — Diagnostic UI + login gate (2 days)**
- `DiagnosticIntro.tsx` — one-screen sell + "Start" / "Skip for now"
- `DiagnosticTest.tsx` — MCQ flow with timer, embedded `ProblemSolver` for the coding item
- `DiagnosticResult.tsx` — belt reveal animation + per-pillar levels + "Generate my pipeline" CTA
- `App.tsx` guard: post-login, if no `UserSkillProfile.diagnosticAt`, route to `DiagnosticIntro`

**Sprint C — Pipeline generation + UI (2-3 days)**
- `pipelineService.ts`: `generatePipeline(userId, focus, targetCompany?)`
- `checkPipelineGates(userId, event)` helper wired into: quiz submit, `/code/submit`, `finishInterview`
- `PipelinePage.tsx` with snake-path visualization
- Sidebar entry + Dashboard "Your Pipeline" card
- 3 preset packs (balanced / placement-6w / coding-only)

**Sprint D — Polish + belts (1-2 days)**
- Level-up notification toast when a stage completes and a pillar levels up
- 7 pipeline achievements seeded
- `/pipeline/:id/refresh` — user-triggered regeneration if their profile has shifted significantly
- Migration notice for existing users: "Take the diagnostic to unlock your personalized pipeline"

## Files (13 new, 6 modified)

**New:**
- `server/src/services/diagnosticService.ts` — attempt start/grade, level compute
- `server/src/services/pipelineService.ts` — generation + gate checking
- `server/src/routes/diagnostic.ts`, `pipeline.ts`, `skillProfile.ts`
- `server/scripts/seed-pipeline-achievements.ts`
- `client/src/pages/DiagnosticIntro.tsx`, `DiagnosticTest.tsx`, `DiagnosticResult.tsx`, `PipelinePage.tsx`
- `client/src/components/BeltBadge.tsx`, `SnakePath.tsx`, `StageCard.tsx`

**Modified:**
- `server/prisma/schema.prisma` — add 4 models
- `server/src/services/xpService.ts` — pipeline XP rules
- `server/src/services/achievementService.ts` — add `belt`, `pipeline_stage`, `pipeline_completed` conditions
- Existing gate points: `coreSubject.ts:submitQuiz`, `code.ts:/submit`, `aiInterviewService.ts:finishInterview` — one added line each to call `checkPipelineGates`
- `client/src/App.tsx` — post-login guard + `/pipeline` and `/diagnostic-*` routes
- `client/src/pages/Dashboard.tsx` — "Your Pipeline" summary card
- `client/src/components/LeftNav.tsx` — "🎯 My Pipeline" first entry

## Key Design Decisions

1. **Diagnostic is short (25 Q, ~20 min), not exhaustive** — placement students bail on 60-question tests. A 25-item mix is enough to bucket someone into a level 1-5 per pillar with ~15% margin of error, which is fine because we refresh from live activity anyway.

2. **Adaptive difficulty is "flip after every 3 items", not full IRT** — proper computerized adaptive testing needs item calibration data we don't have. Simple accuracy-based flipping gives 80% of the value at 1% of the complexity.

3. **The pipeline is generated once at diagnostic-submit time, then refreshed on demand** — not regenerated after every activity. Users hate when their plan shifts under them. Explicit "regenerate" button + auto-refresh only when a pillar level changes by ≥ 2.

4. **Gates are checked by existing event hooks, not a background job** — same pattern as achievements. Instant feedback ("Stage unlocked!") beats polling.

5. **Skip button on both diagnostic and pipeline** — never trap users. Skipping the diagnostic just means their profile stays "Unranked" and they land on the old Dashboard. They can retake it later from Prep Tracker.

6. **Pipeline doesn't replace anything, it layers** — quests still fire off interviews, `StudyPlan` still tracks weak topics, mastery still updates. Pipeline is the *organizing narrative* on top of these signals, not a replacement for them.

7. **Belts are visual, levels are functional** — the Bronze → Diamond belt is for motivation ("show me the badge"). The per-pillar 1-5 level is what actually drives stage selection. Two systems, two purposes.

## Open Questions (worth confirming before Sprint A)

- **Is the diagnostic mandatory or skippable?** — Default plan: skippable, but persistent nudge until taken.
- **How long between diagnostic retakes?** — Default: unlimited (user-triggered from Prep Tracker), but the pipeline only regenerates automatically if a pillar level shifts by ≥ 2.
- **Should placement students who take Placement Drive skip the diagnostic?** — Probably yes: a completed drive has all the signal we need. Auto-populate `UserSkillProfile` from drive results.
- **Communication pillar has no diagnostic** — do we surface this as "level 1 (self-report)" or hide until they've done an AI interview? Default: show as "unranked" with a CTA to take an HR mock.

