import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds the HR & Behavioral question bank (HrQuestion table) used by the
// /hr routes and the HrPrep page. ~60 curated questions across 11 categories,
// each with STAR / direct-answer guidance and a skeleton outline (never a
// memorizable script). Company tags mark questions famously asked by specific
// recruiters (amazon → leadership principles, TCS/Infosys/Wipro/Cognizant/
// Capgemini → relocation/bond/shift willingness, banks → integrity/client
// focus/markets, Deloitte/ZS → consulting fit, Microsoft → growth mindset).
//
// Idempotence strategy: DELETE-ALL-THEN-CREATE. This bank is authoritative —
// re-running the script replaces the whole table with the canonical set.

interface HrDef {
  question: string;
  category: string;
  starGuidance: string;
  sampleOutline: string;
  companyTags?: string[];
}

const BANK: HrDef[] = [
  // ===================== INTRO (5) =====================
  {
    category: 'intro',
    question: 'Tell me about yourself.',
    starGuidance: [
      '- **Use Present → Past → Future**: who you are now (degree, specialization), 1-2 proof points from the past (projects, internship), and why this role is the natural next step.',
      '- Keep it to 60-90 seconds — this is a trailer, not the whole movie.',
      '- End with a hook the interviewer can pull on ("…which is why the backend work in this role excites me").',
      '- Do not recite your resume line by line; pick the 2 highlights that best match the job.',
    ].join('\n'),
    sampleOutline: [
      '- **Present**: final-year [branch] student at [college], focused on [area]',
      '- **Past**: built [project] ([impact/metric]); internship or club role that proves [skill]',
      '- **Future**: looking to apply [skill] in [role type] — which is exactly this role',
      '- **Hook**: one sentence on what genuinely excites you about the work here',
    ].join('\n'),
  },
  {
    category: 'intro',
    question: 'Walk me through your resume.',
    starGuidance: [
      '- Tell it as a **story with a thread**, not a list — each item should answer "why did you do this next?"',
      '- Spend time proportional to relevance: 10 seconds on school, 60 seconds on your strongest project.',
      '- Quantify wherever possible (users, marks, rank, % improvement).',
      '- Pre-empt the obvious question: briefly explain any gap or dip yourself before they ask.',
    ].join('\n'),
    sampleOutline: [
      '- Education in one line → why you picked your branch',
      '- Project/internship 1: what it was, your exact role, one metric',
      '- Project/internship 2: what changed in your skills between the two',
      '- Where the thread points next: this role',
    ].join('\n'),
  },
  {
    category: 'intro',
    question: 'How would your friends or professors describe you?',
    starGuidance: [
      '- Pick **2 traits + 1 mini-story each** — a description without evidence sounds invented.',
      '- Choose work-relevant traits: reliable, curious, calm under deadlines — not "fun at parties."',
      '- One light human trait at the end is fine; it makes the professional ones believable.',
    ].join('\n'),
    sampleOutline: [
      '- Trait 1 (e.g., dependable): the time teammates handed you the final demo',
      '- Trait 2 (e.g., curious): the thing you taught yourself unprompted',
      '- One-line human touch (the friend-voice version)',
    ].join('\n'),
  },
  {
    category: 'intro',
    question: 'What do you do outside academics? Tell me about your hobbies.',
    starGuidance: [
      '- Pick hobbies you can discuss in depth — one follow-up ("what was the last book?") should not sink you.',
      '- Where honest, connect a hobby to a work-relevant trait (chess → planning, team sport → coordination) — but never force it.',
      '- Depth beats breadth: one real hobby with specifics beats five generic ones.',
    ].join('\n'),
    sampleOutline: [
      '- Hobby 1: what, how long, one concrete recent detail (last thing you made/read/played)',
      '- Hobby 2: brief mention',
      '- Optional: one thing a hobby taught you that shows up in your work',
    ].join('\n'),
  },
  {
    category: 'intro',
    question: 'What makes you different from the other candidates we are interviewing today?',
    starGuidance: [
      '- Do not compare yourself to others (you have not met them) — reframe to your **specific combination** of skills.',
      '- Formula: skill + skill + proof. "Many people know X; fewer have shipped X with Y — I did that in [project]."',
      '- Confidence without arrogance: state facts and evidence, not adjectives.',
    ].join('\n'),
    sampleOutline: [
      '- The combination: e.g., solid DSA + a real deployed project + communication (club role)',
      '- One proof point for the rarest element of the combination',
      '- Close: how exactly that combination maps to this role',
    ].join('\n'),
  },

  // ===================== STRENGTHS (5) =====================
  {
    category: 'strengths',
    question: 'What are your greatest strengths?',
    starGuidance: [
      '- Use **Claim → Evidence → Relevance**: name the strength, prove it with one specific story or metric, connect it to this job.',
      '- Pick 2 strengths max; three or more dilutes all of them.',
      '- Choose strengths the role actually needs (read the JD) — "creativity" is weak for a support role, gold for a design role.',
    ].join('\n'),
    sampleOutline: [
      '- Strength 1: claim → the project/incident that proves it → why this role needs it',
      '- Strength 2: same shape, told shorter',
      '- Close: one line inviting them to probe either story',
    ].join('\n'),
  },
  {
    category: 'strengths',
    question: 'What is your greatest achievement so far?',
    starGuidance: [
      '- Pick something with **effort + obstacle + outcome** — achievement without struggle sounds like luck.',
      '- Quantify the outcome (rank, %, users, prize) and name what it cost (weeks of work, learning a new stack).',
      '- It does not have to be grand: a hard-won small thing told well beats a vague big thing.',
    ].join('\n'),
    sampleOutline: [
      '- Context: what you set out to do and why it was hard *for you*',
      '- Action: the specific work and sacrifice',
      '- Result: the number/outcome',
      '- Reflection: what it proved about how you operate',
    ].join('\n'),
  },
  {
    category: 'strengths',
    question: 'What skill are you most proud of, and how did you build it?',
    starGuidance: [
      '- The interviewer is testing **how you learn**, not just what you know — narrate the learning process.',
      '- Show deliberate practice: the resources you used, the feedback loops, the milestones.',
      '- End with proof the skill is real (a project, contest, or task that used it).',
    ].join('\n'),
    sampleOutline: [
      '- The skill + why you chose to build it',
      '- The how: resources, practice routine, feedback you sought',
      '- Proof: the moment the skill actually delivered',
    ].join('\n'),
  },
  {
    category: 'strengths',
    question: 'What would your project teammates say was your biggest contribution?',
    starGuidance: [
      '- Answer in their voice — "they would say I was the one who…" is concrete and modest at once.',
      '- Pick a contribution with a visible artifact: the module you owned, the bug you unblocked, the deadline you saved.',
      '- Credit the team in one line; taking sole credit for a team project is a red flag.',
    ].join('\n'),
    sampleOutline: [
      '- The project in one line',
      '- The contribution teammates would actually name (specific module/moment)',
      '- One line of shared credit + the outcome',
    ].join('\n'),
  },
  {
    category: 'strengths',
    question: 'Give me an example of a time one of your strengths directly led to a good outcome.',
    starGuidance: [
      '- This is behavioral — use **STAR** (Situation, Task, Action, Result).',
      '- The Action section must show the *strength in motion*, not just claim it.',
      '- Result should be concrete: grade, demo success, time saved, conflict resolved.',
    ].join('\n'),
    sampleOutline: [
      '- **S/T**: the project and what was at stake',
      '- **A**: 2-3 actions where the strength visibly shows',
      '- **R**: the measurable outcome',
      '- Link back: "that is the strength I would bring here"',
    ].join('\n'),
  },

  // ===================== WEAKNESS (4) =====================
  {
    category: 'weakness',
    question: 'What is your biggest weakness?',
    starGuidance: [
      '- Formula: **real weakness + impact you noticed + concrete fix in progress**. Fake weaknesses ("I work too hard") are instantly recognized.',
      '- Choose a genuine but non-fatal weakness for this role — do not tell an analytics firm you are careless with numbers.',
      '- The fix must be specific and verifiable ("I now keep a written checklist / timebox my research"), not "I am working on it."',
    ].join('\n'),
    sampleOutline: [
      '- The weakness, named honestly and specifically',
      '- Where it bit you: one small real story',
      '- The system you built to manage it + evidence it is improving',
    ].join('\n'),
  },
  {
    category: 'weakness',
    question: 'What skill or subject do you find most difficult?',
    starGuidance: [
      '- Honesty + strategy: name the subject and immediately show your coping strategy.',
      '- Frame as "slower, not incapable" — you can learn it, it just costs you more effort than other topics.',
      '- Bonus: show a case where you delivered in it anyway despite the difficulty.',
    ].join('\n'),
    sampleOutline: [
      '- The subject/skill + why it is hard for you specifically',
      '- The workaround/strategy you use (extra practice, different resources, peers)',
      '- Evidence you can still deliver in it when needed',
    ].join('\n'),
  },
  {
    category: 'weakness',
    question: 'Tell me about a piece of critical feedback you received. How did you respond?',
    companyTags: ['microsoft'],
    starGuidance: [
      '- Use **STAR**, with the emphasis on your **response**, not the feedback itself.',
      '- Do not get defensive in the retelling — the meta-test is whether you can discuss criticism calmly.',
      '- Show a changed behavior that persisted, not a one-time apology.',
      '- Microsoft lens: this is a **growth mindset** probe — feedback as fuel, "learn-it-all" over "know-it-all."',
    ].join('\n'),
    sampleOutline: [
      '- **S/T**: the work + who gave the feedback',
      '- The feedback itself, short and unsoftened',
      '- **A**: how you processed it and what you concretely changed',
      '- **R**: proof the change stuck (a later piece of work)',
    ].join('\n'),
  },
  {
    category: 'weakness',
    question: 'If we hired you, what would you struggle with in your first three months?',
    starGuidance: [
      '- This tests self-awareness about the college-to-work transition — name a realistic ramp-up cost (large codebase, corporate processes, ambiguity).',
      '- Pair it with your ramp-up plan: the questions you would ask, docs you would read, people you would shadow.',
      '- Avoid answers that question your core fitness for the role.',
    ].join('\n'),
    sampleOutline: [
      '- The realistic struggle (e.g., navigating a big legacy codebase)',
      '- Why: what in your background makes it genuinely new',
      '- Your 30/60/90-style plan to close the gap',
    ].join('\n'),
  },

  // ===================== FAILURE (5) =====================
  {
    category: 'failure',
    question: 'Tell me about a time you failed.',
    companyTags: ['amazon'],
    starGuidance: [
      '- Use **STAR + L (Learned)** — the "Learned" is the actual answer.',
      '- Pick a real failure with real stakes where the cause was something *you* controlled. Blaming others fails the question.',
      '- Show the changed behavior since — ideally a later situation where the lesson paid off.',
      '- Amazon lens: maps to *Learn and Be Curious / Earn Trust* — own it plainly, zero hedging.',
    ].join('\n'),
    sampleOutline: [
      '- **S/T**: the goal and the stake',
      '- What went wrong + your honest share of the cause',
      '- **L**: the specific, generalizable lesson',
      '- The later moment where the lesson changed your behavior',
    ].join('\n'),
  },
  {
    category: 'failure',
    question: 'Describe a project that did not go as planned.',
    starGuidance: [
      '- STAR, with emphasis on **detection and course-correction**: when did you notice, and what did you change?',
      '- Distinguish a planning failure from an execution failure — name which yours was.',
      '- A partial result is a strong ending: "we shipped a reduced scope on time" beats a fairy tale.',
    ].join('\n'),
    sampleOutline: [
      '- The plan vs. what actually happened',
      '- The moment you noticed the drift',
      '- The re-plan: what you cut, changed, or escalated',
      '- Outcome + what your plans include now (buffers, checkpoints)',
    ].join('\n'),
  },
  {
    category: 'failure',
    question: 'Tell me about a time you missed a deadline.',
    starGuidance: [
      '- Own it without drama: cause → what you did the moment you knew → damage control → prevention.',
      '- The key beat: **did you warn people early or hide it?** Early communication is the pass criterion.',
      '- Close with your current system (task breakdown, buffer days, early red flags).',
    ].join('\n'),
    sampleOutline: [
      '- The deadline and why it slipped (your role in the cause)',
      '- When and how you communicated it',
      '- What you salvaged',
      '- The prevention habit you adopted afterwards',
    ].join('\n'),
  },
  {
    category: 'failure',
    question: 'What is the biggest mistake you have made, and what did you learn from it?',
    starGuidance: [
      '- Pick a mistake with a **decision at its core** (a wrong choice), not an accident — decisions show judgment growth.',
      '- Structure: decision → consequence → lesson → the new rule you follow.',
      '- Never pick a mistake involving integrity (cheating, lying) — those are disqualifying, not humanizing.',
    ].join('\n'),
    sampleOutline: [
      '- The decision you made and why it seemed right at the time',
      '- The consequence',
      '- The generalized lesson ("I now always…")',
      '- Optional: a later win that rule produced',
    ].join('\n'),
  },
  {
    category: 'failure',
    question: 'Tell me about a goal you set for yourself and did not achieve.',
    companyTags: ['amazon'],
    starGuidance: [
      '- STAR + L; be candid about whether the goal was unrealistic, the plan weak, or the effort short — each is a different lesson.',
      '- Show that failing the goal did not mean abandoning the direction (a revised goal, a second attempt).',
      '- Amazon lens: *Deliver Results* — show you treat missed goals as data, not identity.',
    ].join('\n'),
    sampleOutline: [
      '- The goal + why it mattered to you',
      '- The gap: what you actually reached',
      '- The root cause, honestly assigned',
      '- The revised goal and where it stands today',
    ].join('\n'),
  },

  // ===================== CONFLICT (5) =====================
  {
    category: 'conflict',
    question: 'Tell me about a time you disagreed with a teammate.',
    starGuidance: [
      '- STAR with the spotlight on **how you disagreed**: privately, with data, listening first.',
      '- Show you separated the idea from the person — no character commentary.',
      '- Strong endings: either you convinced them with evidence, or they convinced you and you said so.',
    ].join('\n'),
    sampleOutline: [
      '- The disagreement and what was at stake',
      '- How you raised it (setting, tone, the data you brought)',
      '- The resolution mechanism (prototype, test, third opinion)',
      '- Result + relationship intact',
    ].join('\n'),
  },
  {
    category: 'conflict',
    question: 'Tell me about a time you disagreed with your manager or professor. What did you do?',
    companyTags: ['amazon'],
    starGuidance: [
      "- This is Amazon's *Have Backbone; Disagree and Commit* — respectful pushback **with data**, then full commitment to the final call.",
      '- The two failure modes are silence (no backbone) and sulking after the decision (no commit) — show you avoided both.',
      '- Keep the authority figure respectable in your telling; trashing a professor reads as trashing a future manager.',
    ].join('\n'),
    sampleOutline: [
      '- The call you disagreed with + your evidence',
      '- How you voiced it: privately, specific, non-personal',
      '- The decision that was made',
      '- How you committed fully — and the outcome either way',
    ].join('\n'),
  },
  {
    category: 'conflict',
    question: 'Describe a time you had to work with a difficult person.',
    starGuidance: [
      '- Define "difficult" **behaviorally** (missed handoffs, dominating meetings) — never as a personality verdict.',
      '- Show your adaptation: a changed communication channel, clearer interfaces, one direct 1:1 conversation.',
      '- The result should be a working relationship, not a won war.',
    ].join('\n'),
    sampleOutline: [
      '- The behavior (not the person) that made collaboration hard',
      '- Your first attempt + what you learned about their style',
      '- The adjustment that actually worked',
      '- Outcome for the project and the relationship',
    ].join('\n'),
  },
  {
    category: 'conflict',
    question: 'Tell me about a time a decision went against you and you had to execute it anyway.',
    companyTags: ['amazon'],
    starGuidance: [
      '- *Disagree and Commit*, part two: the test is the **quality of your execution after losing the argument**.',
      '- Zero sabotage and zero "I told you so" — even if you were later proven right, describe that gently.',
      '- Explain what committing looked like concretely: you did the work and defended the decision to others.',
    ].join('\n'),
    sampleOutline: [
      '- The decision + your objection (stated once, on record)',
      '- The moment you switched to commit mode',
      '- What full execution looked like',
      '- The outcome and what it taught you about how teams work',
    ].join('\n'),
  },
  {
    category: 'conflict',
    question: 'How do you handle criticism of your work?',
    starGuidance: [
      '- Give a **process, then a proof**: your routine (listen fully → clarify → sort valid from noise → act), then one real example.',
      '- Distinguish reaction from response — admitting the first 10 seconds sting makes the rest credible.',
      '- Show a case where criticism made the work measurably better.',
    ].join('\n'),
    sampleOutline: [
      '- Your routine in 2-3 steps',
      '- The example: what was criticized, what you changed',
      '- The better outcome that resulted',
      '- One line: how you now invite criticism early instead of waiting for it',
    ].join('\n'),
  },

  // ===================== TEAMWORK (5) =====================
  {
    category: 'teamwork',
    question: 'Tell me about a successful team project and your role in it.',
    starGuidance: [
      '- STAR; be precise about **your** slice — "we" for context, "I" for actions.',
      '- Name the team mechanics that made it work (division of labor, standups, reviews) — that is the actual teamwork evidence.',
      '- One line of credit to a specific teammate makes the whole story more credible.',
    ].join('\n'),
    sampleOutline: [
      '- The project + team size + goal',
      '- Your specific role and 2 key actions',
      '- The collaboration mechanics the team used',
      '- Result + shared credit',
    ].join('\n'),
  },
  {
    category: 'teamwork',
    question: "Describe a time a teammate wasn't pulling their weight. What did you do?",
    starGuidance: [
      '- The expected arc: **talk to them first** (privately, assuming good faith) → uncover the real blocker → adjust → escalate only if needed.',
      '- Jumping straight to the professor/manager, or silently doing their work, both fail the question.',
      '- Show the outcome for both the project AND the person.',
    ].join('\n'),
    sampleOutline: [
      '- The signal something was off (missed pieces, silence in meetings)',
      '- The private conversation — what you asked, what you actually learned',
      '- The fix (re-scoping, pairing, a deadline assist)',
      '- Result + where escalation would have been step two',
    ].join('\n'),
  },
  {
    category: 'teamwork',
    question: 'How do you handle working with people whose working style differs from yours?',
    starGuidance: [
      '- Show you **diagnose styles** (planner vs. improviser, writer vs. talker) rather than judging them.',
      '- Give a concrete adaptation you have made: switching to written specs, agreeing on checkpoints.',
      '- The claim to land: differences are a feature you know how to operate, not friction you tolerate.',
    ].join('\n'),
    sampleOutline: [
      '- A real style clash you have experienced',
      '- How you named the difference (to yourself or out loud)',
      '- The working agreement you landed on',
      '- What the mix produced that sameness would not have',
    ].join('\n'),
  },
  {
    category: 'teamwork',
    question: 'Tell me about a time you helped a struggling teammate.',
    starGuidance: [
      '- STAR; the skill on display is **noticing** — how did you spot the struggle before it was announced?',
      '- Show help that built capability (explaining, pairing) rather than just absorbing their work.',
      '- Keep them dignified in your telling; kindness in retrospect counts.',
    ].join('\n'),
    sampleOutline: [
      '- How you noticed something was wrong',
      '- What you offered and how you framed it (no rescue theater)',
      '- What they could do afterwards that they could not before',
      '- Project outcome',
    ].join('\n'),
  },
  {
    category: 'teamwork',
    question: 'Do you prefer working alone or in a team? Why?',
    starGuidance: [
      '- Avoid both extremes — the honest strong answer is "**depends on the phase of work**" with a real example of each.',
      '- Show self-awareness: your default role in a team, and what you need for solo deep work.',
      "- End aligned with the job's reality (most roles: team-based with individual ownership).",
    ].join('\n'),
    sampleOutline: [
      '- Your honest default + the caveat by type of work',
      '- Team example: the role you naturally take',
      '- Solo example: what you deliver alone',
      "- Tie to this role's actual mix",
    ].join('\n'),
  },

  // ===================== LEADERSHIP (5) =====================
  {
    category: 'leadership',
    question: 'Tell me about a time you led a team.',
    starGuidance: [
      '- STAR; leadership = **decisions + unblocking + accountability**, not "I told people what to do."',
      '- Include one moment of adversity mid-project — leadership stories without friction sound like coordination stories.',
      '- Result should include a team outcome and one line on what you would do differently.',
    ].join('\n'),
    sampleOutline: [
      '- The team, the goal, and why you were the one leading',
      '- 2 leadership actions (a decision, an unblock, a hard conversation)',
      '- The rough patch and your response to it',
      '- Outcome + one honest lesson',
    ].join('\n'),
  },
  {
    category: 'leadership',
    question: 'Describe a time you took ownership of something outside your responsibility.',
    companyTags: ['amazon'],
    starGuidance: [
      '- Amazon\'s *Ownership* principle: "that\'s not my job" is the anti-answer — show you saw a gap and closed it without being asked.',
      '- Explain the judgment: why acting beat escalating or waiting, and how you kept the actual owner informed.',
      '- Small scope is fine; unprompted initiative is the point.',
    ].join('\n'),
    sampleOutline: [
      '- The gap you noticed (and whose job it technically was)',
      '- Your decision to act + how you communicated it',
      '- What you actually did',
      "- The outcome + how the team's process changed after",
    ].join('\n'),
  },
  {
    category: 'leadership',
    question: 'Tell me about a time you had to motivate others.',
    starGuidance: [
      '- Diagnose before you motivate: show you found out *why* energy was low (fatigue, unclear goal, unfairness) rather than giving a pep talk.',
      '- Concrete motivators beat speeches: re-scoping, celebrating a small win, redistributing boring work, showing the end user.',
      '- Result: name the **behavior change** you observed, not just "morale improved."',
    ].join('\n'),
    sampleOutline: [
      '- The slump and its visible symptoms',
      '- What you learned about the real cause',
      '- The 1-2 concrete things you changed',
      '- The behavior change that followed',
    ].join('\n'),
  },
  {
    category: 'leadership',
    question: 'Describe a situation where you influenced people without formal authority.',
    starGuidance: [
      '- The toolkit to display: **evidence, prototypes, allies, and framing** — not persistence alone.',
      "- Show you understood the other side's incentives and addressed *their* concern, not just repeated yours.",
      '- A small demo/POC that changed minds is the classic strong story.',
    ].join('\n'),
    sampleOutline: [
      '- The change you wanted + why others resisted it',
      '- Their real concern, as you came to understand it',
      '- The evidence/demo/ally you brought',
      '- The decision that followed',
    ].join('\n'),
  },
  {
    category: 'leadership',
    question: 'Tell me about a hard decision you made as a leader.',
    starGuidance: [
      '- Pick a decision with a **genuine trade-off** (scope vs. deadline, person vs. project) and show the criteria you used.',
      '- Explain how you communicated it to the people it disadvantaged — that is the leadership part.',
      '- Own the outcome either way; hedged decisions retold with hindsight confidence ring false.',
    ].join('\n'),
    sampleOutline: [
      '- The fork and what each path would cost',
      '- Your criteria and the call you made',
      '- How you told the people it affected',
      '- The result + whether you would decide the same again',
    ].join('\n'),
  },

  // ===================== WHY-US (6) =====================
  {
    category: 'why-us',
    question: 'Why do you want to work for us, and what do you know about our company?',
    starGuidance: [
      '- Structure: **what you know (specific) → what you want (honest) → the overlap**. The overlap is the answer.',
      '- Research proof beats flattery: name a product, a recent announcement, a tech blog post, or their training program — one specific thing you can discuss for a minute.',
      '- If a line could be said to their competitor unchanged ("great culture, good growth"), cut it.',
    ].join('\n'),
    sampleOutline: [
      '- One specific, true thing about the company (product / scale / program / recent news)',
      '- What you are looking for in your first role',
      '- The overlap: why this match works in both directions',
      '- Close: what you would want to work on there',
    ].join('\n'),
  },
  {
    category: 'why-us',
    question:
      'Why do you want to join an IT services company? Are you comfortable with relocation, rotating shifts, and the service agreement?',
    companyTags: ['tcs', 'infosys', 'wipro', 'cognizant', 'capgemini'],
    starGuidance: [
      '- Answer the flexibility questions **plainly and first** — a hedge on relocation/shifts/bond can end the interview at mass recruiters. Decide your real answer before you walk in.',
      '- For "why services": breadth is the honest sell — exposure to multiple domains, clients, and technologies plus structured training (name their program: TCS ILP, Infosys Mysore training, etc.).',
      '- If you have a genuine constraint, state it honestly with a workable frame; a false yes creates a real problem at posting time.',
    ].join('\n'),
    sampleOutline: [
      '- Direct yes / qualified-yes on relocation, shifts, and the agreement',
      '- Why services suits your stage: structured training + breadth + scale of real projects',
      '- One company-specific detail (their training program or a domain they lead in)',
      '- What you want to become there in 2-3 years',
    ].join('\n'),
  },
  {
    category: 'why-us',
    question: 'Why Amazon? Which leadership principle resonates most with you, and when have you lived it?',
    companyTags: ['amazon'],
    starGuidance: [
      '- Amazon interviews are structured around the **Leadership Principles** — pick 1-2 (Customer Obsession, Ownership, Bias for Action…) and prepare a real STAR story for each.',
      '- "Why Amazon" should reference specifics (working backwards, the LP culture itself, scale of systems), not just "big company."',
      '- The LP you pick must match your stories — do not claim Bias for Action and then tell a story about slow careful planning.',
    ].join('\n'),
    sampleOutline: [
      '- Why Amazon: the specific cultural or technical thing that attracts you',
      '- Your chosen LP + why it maps to who you already are',
      '- The 60-second STAR story that proves you have lived it',
      '- Close: the kind of problems you want to own there',
    ].join('\n'),
  },
  {
    category: 'why-us',
    question: 'Why Microsoft? What does growth mindset mean to you?',
    companyTags: ['microsoft'],
    starGuidance: [
      '- Microsoft explicitly hires for **growth mindset** ("learn-it-all" over "know-it-all") — define it in your own words with a story of learning from failure or feedback.',
      '- Reference something concrete you use or admire (Azure, VS Code, GitHub, their accessibility work).',
      '- The trap: reciting Satya Nadella quotes without a personal story. The story *is* the answer.',
    ].join('\n'),
    sampleOutline: [
      "- Why Microsoft: the product or mission piece that's personally real to you",
      '- Growth mindset defined in your own words',
      '- Your story: a skill you lacked → feedback/failure → deliberate improvement → result',
      '- How you would keep learning in this role',
    ].join('\n'),
  },
  {
    category: 'why-us',
    question: 'Why do you want to work in financial services, and what interests you about markets?',
    companyTags: ['goldman-sachs', 'jp-morgan', 'standard-chartered'],
    starGuidance: [
      '- Show genuine markets curiosity: know one current rates/markets theme at headline level and be ready for "what is happening in markets right now?"',
      '- For tech roles at banks the sell is **engineering at market scale + domain depth** (low latency, risk systems, digital banking) — not "I will move to trading later."',
      '- Integrity and client focus are core to these firms — weave in one line on why a trust-based business appeals to you.',
    ].join('\n'),
    sampleOutline: [
      '- The honest origin of your finance interest (a course, the news, a project)',
      '- One current markets theme you can discuss for two minutes',
      '- Why tech-in-finance specifically: the systems that excite you',
      '- One line on trust/integrity as a reason you like this industry',
    ].join('\n'),
  },
  {
    category: 'why-us',
    question: "Why consulting? And why should a client trust a fresher's recommendation?",
    companyTags: ['deloitte', 'zs-associates'],
    starGuidance: [
      '- Two-part question; answer both. Why consulting: variety of problems, steep learning curve, client exposure — backed by a story showing you enjoy ambiguous problems.',
      '- The trust question is a self-awareness mini-case: the honest answer is **method + firm + data** — clients trust the structured approach and the firm\'s experience, which you execute rigorously.',
      '- Expect a follow-up guesstimate or mini-case; show comfort with structured thinking (issue trees, hypotheses).',
    ].join('\n'),
    sampleOutline: [
      '- Why consulting for you: the problem-variety story',
      "- The trust answer: rigor + data + the firm's method, not your years of experience",
      '- One example of you thinking in structures',
      '- Close: why this firm (ZS → analytics/healthcare depth; Deloitte → scale and variety)',
    ].join('\n'),
  },

  // ===================== CAREER GOALS (5) =====================
  {
    category: 'career-goals',
    question: 'Where do you see yourself in five years?',
    starGuidance: [
      '- Show **direction, not a job title**: the skills you want to own and the responsibility level you are aiming for.',
      '- Anchor it in growth realistically available at this company — a path they can actually offer you.',
      '- Target tone: ambition + patience — eager to grow, not planning your exit.',
    ].join('\n'),
    sampleOutline: [
      '- Years 1-2: master the craft (name what, specifically)',
      '- Years 3-5: the deeper capability (own a module, mentor juniors, go deep in a domain)',
      "- Why this company's growth path enables exactly that",
    ].join('\n'),
  },
  {
    category: 'career-goals',
    question: 'What are your short-term and long-term career goals?',
    starGuidance: [
      '- Short-term should be concrete and job-adjacent (become dependable in X stack, own a feature end-to-end).',
      '- Long-term can be directional (technical depth vs. leadership) — certainty about year 10 sounds naive; a considered direction sounds mature.',
      '- Show one thing you are **already doing** toward the short-term goal.',
    ].join('\n'),
    sampleOutline: [
      '- Short-term (1-2 yrs): the concrete competence goal + your current action toward it',
      '- Long-term: the direction and the reason behind it',
      '- The bridge: how this role starts that path',
    ].join('\n'),
  },
  {
    category: 'career-goals',
    question: 'Are you planning higher studies (MS/MBA)? Would you leave the job for them?',
    companyTags: ['tcs', 'infosys', 'wipro', 'cognizant', 'capgemini'],
    starGuidance: [
      '- Mass recruiters ask this to gauge **attrition risk** — a hedge-free answer framed around commitment works best.',
      '- If genuinely not planning: say so plainly with your reasoning (the learning you want right now happens on the job).',
      '- If open to it someday: frame it as "not in the near term; if ever, in a way that builds on work experience (sponsored/part-time), after real contribution here."',
    ].join('\n'),
    sampleOutline: [
      '- Your direct answer for the next 2-3 years',
      '- The reasoning: what you want to learn from real work first',
      '- If applicable: the only future scenario, framed around growing *with* the company',
    ].join('\n'),
  },
  {
    category: 'career-goals',
    question: 'Technical specialist or manager — where do you see yourself growing?',
    starGuidance: [
      '- There is no wrong pick, but there is a wrong reason — "manager because it pays more" and "IC because I dislike people" both fail.',
      '- It is honest and safe to note the fork is years away; then state your current lean **with a reason from real experience**.',
      '- Show you know what each track actually involves day-to-day.',
    ].join('\n'),
    sampleOutline: [
      '- Your current lean + the college evidence for it (did you enjoy leading the team, or going deepest?)',
      '- One line on what you know each path demands',
      '- The fork is at year 4-5; name what will decide it for you',
    ].join('\n'),
  },
  {
    category: 'career-goals',
    question: 'How does this role fit into your career plan?',
    starGuidance: [
      '- Reverse the job description: name 2-3 things this specific role teaches and map each to your plan.',
      '- Show the fit is **two-way** — what you bring now, what you take forward.',
      '- Danger word: "stepping stone." The frame is foundation, not springboard.',
    ].join('\n'),
    sampleOutline: [
      '- Skill 1 this role builds → where it goes in your plan',
      '- Skill 2 / domain exposure → same mapping',
      '- What you bring on day one',
      '- Why the timing is right for both sides',
    ].join('\n'),
  },

  // ===================== PRESSURE (5) =====================
  {
    category: 'pressure',
    question: 'How do you handle stress and pressure? Give me an example.',
    starGuidance: [
      '- Formula: **your system + one live example**. A system without a story is theory; a story without a system is luck.',
      '- Good systems name-check: breaking work down, triage lists, timeboxing, asking for help early, honest sleep/exercise habits.',
      '- Pick an example where the pressure was real (exam week + project demo) and the output stayed decent.',
    ].join('\n'),
    sampleOutline: [
      '- Your 2-3 step system when pressure spikes',
      '- The example: the crunch, the system applied to it',
      '- The result + what the crunch taught you',
      '- One line: the pressure you actively avoid creating (starting late)',
    ].join('\n'),
  },
  {
    category: 'pressure',
    question: 'Tell me about a time you had to meet multiple deadlines at once. How did you prioritize?',
    starGuidance: [
      '- Name your actual triage criteria: deadline proximity, stakes, effort required, and what could be negotiated or dropped.',
      '- The senior move to show: **renegotiating scope early** with whoever owns the deadline, not silently dropping quality.',
      '- STAR it with the competing items listed concretely — a vague "many things" weakens the story.',
    ].join('\n'),
    sampleOutline: [
      '- The collision: the 3-4 concrete things due together',
      '- Your triage: what ranked where, and why',
      '- The negotiation: what you flagged, moved, or cut',
      '- Honest ending: what shipped at what quality',
    ].join('\n'),
  },
  {
    category: 'pressure',
    question: 'Describe a time you had to make a decision or act with incomplete information.',
    companyTags: ['amazon', 'deloitte', 'zs-associates'],
    starGuidance: [
      '- Amazon calls this *Bias for Action*; consulting calls it hypothesis-driven work — show you can size a decision (reversible vs. irreversible) and act accordingly.',
      '- Structure: what you knew / what you could not know / the assumption you made **explicit** / the checkpoint you set to catch a wrong guess.',
      '- The failure mode to avoid describing: waiting for certainty that was never coming.',
    ].join('\n'),
    sampleOutline: [
      '- The decision and the information gap',
      '- Reversible or one-way? Your read on the stakes',
      '- The explicit assumption + the safety net (checkpoint, rollback plan)',
      '- Outcome + whether the assumption held',
    ].join('\n'),
  },
  {
    category: 'pressure',
    question: 'What was your most stressful period in college, and how did you get through it?',
    starGuidance: [
      '- Authenticity wins — a real crunch (placements + exams, fest + submissions) told plainly beats a heroic epic.',
      '- Show both coping mechanics (planning, help-seeking) and self-care honesty; pure grind-glorification is a yellow flag to good employers.',
      '- End on what you changed afterward so the same stress does not recur.',
    ].join('\n'),
    sampleOutline: [
      '- The period and the pressures that converged',
      '- What you triaged and whom you leaned on',
      '- What actually got you through (mechanics, not magic)',
      '- The habit you kept from it',
    ].join('\n'),
  },
  {
    category: 'pressure',
    question: 'You are assigned more work than you can finish before the deadline. What do you do?',
    starGuidance: [
      '- The expected algorithm: **assess honestly → flag early → propose options** (prioritize, extend, add help, cut scope) — not silent heroics or silent failure.',
      '- Bringing options rather than just the problem is what separates a strong answer from a junior one.',
      '- Note you would push your own efficiency first (cut distractions, ask for the shortcut) before escalating.',
    ].join('\n'),
    sampleOutline: [
      '- Step 1: size the gap honestly, and early',
      '- Step 2: self-help — what you would cut or speed up on your side',
      '- Step 3: the options you would present to whoever assigned the work',
      '- The principle: no surprises at the deadline',
    ].join('\n'),
  },

  // ===================== SITUATIONAL (10) =====================
  {
    category: 'situational',
    question:
      'The night before a group submission, you find a teammate copied code from the internet without attribution. What do you do?',
    companyTags: ['goldman-sachs', 'jp-morgan', 'standard-chartered'],
    starGuidance: [
      '- Integrity questions have a right answer: **you do not submit plagiarized work** — the interviewer is watching for hedging.',
      '- Show humane execution: talk to the teammate first, fix or attribute the code, and accept the cost (late or reduced submission) if needed.',
      '- Banks ask these because trust *is* the product; a clever workaround answer is a fail, not a plus.',
    ].join('\n'),
    sampleOutline: [
      '- First move: the teammate conversation — confirm the facts, no ambush',
      '- The fix options in order: rewrite, attribute properly, remove',
      '- If unfixable in time: what you would tell the professor/lead, and why',
      '- The principle you would state plainly at the end',
    ].join('\n'),
  },
  {
    category: 'situational',
    question:
      "Your manager asks you to report a project as 'on track' to a client when you know it isn't. What do you do?",
    companyTags: ['goldman-sachs', 'jp-morgan', 'standard-chartered'],
    starGuidance: [
      '- Do not caricature the manager — the first move is a **private clarifying conversation**: maybe you lack context, maybe they misspoke.',
      '- If it is what it looks like: state you cannot misrepresent status, propose the honest-but-constructive version (issues + recovery plan), and escalate if pressed.',
      '- The strong frame: honesty as client service — clients forgive slips reported early with a plan; they never forgive discovered lies.',
    ].join('\n'),
    sampleOutline: [
      '- The private question you would ask the manager first',
      '- Your line: what you can and cannot say to a client',
      '- The alternative you would propose: the truth + a recovery plan',
      '- If pressed anyway: the escalation path you would use',
    ].join('\n'),
  },
  {
    category: 'situational',
    question: 'You are on a call and the client is angry and escalating. How do you respond?',
    companyTags: ['goldman-sachs', 'jp-morgan', 'standard-chartered', 'deloitte'],
    starGuidance: [
      '- Sequence to show: **listen fully → acknowledge** (without over-apologizing or blaming colleagues) **→ get specifics → commit to a concrete next step with a time**.',
      '- Do not promise the impossible just to end the call — a false promise converts one escalation into two.',
      '- Mention the follow-through: a written summary with an owner and a deadline is what actually closes escalations.',
    ].join('\n'),
    sampleOutline: [
      '- The listening beat: let them finish completely, take notes',
      '- The acknowledgment line: validate the impact, no throwing teammates under the bus',
      '- Narrow to specifics + the committed next step with a time attached',
      '- The follow-up artifact: written summary, owner, deadline',
    ].join('\n'),
  },
  {
    category: 'situational',
    question:
      'You are given a task in a technology you have never used, due in one week. Walk me through your approach.',
    companyTags: ['microsoft'],
    starGuidance: [
      '- Show a learning algorithm, not panic or bravado: **scope the task → find the closest working example → build the smallest end-to-end slice early → iterate**.',
      '- Name real tactics: the official quickstart, a similar existing repo, the 30-minute overview from someone who has done it.',
      '- Growth-mindset framing (Microsoft): new tech is the job description, not an exception — show this genuinely energizes you.',
    ].join('\n'),
    sampleOutline: [
      '- Day 1: clarify what "done" means + skim the official quickstart',
      '- Day 1-2: smallest working end-to-end slice, however ugly',
      '- Day 3-5: build it up, with a mid-week checkpoint to whoever assigned it',
      '- The insurance: the person/docs channel you use whenever stuck for more than ~2 hours',
    ].join('\n'),
  },
  {
    category: 'situational',
    question: 'Two senior stakeholders give you conflicting instructions. What do you do?',
    starGuidance: [
      '- Never silently pick one or try to do both — the answer is **surfacing the conflict to them cheaply and neutrally**.',
      '- The tactic: restate both asks in writing to both people in one thread, ask them to align, and propose your read of the priority as a starting point.',
      '- If truly stuck, escalate one level **with a recommendation attached**, not just the problem.',
    ].join('\n'),
    sampleOutline: [
      '- Confirm you understood both asks (sometimes it is not really a conflict)',
      '- The neutral note that puts both stakeholders in one thread',
      '- Your proposed resolution as a draft for them to react to',
      '- The escalation-with-recommendation, only if needed',
    ].join('\n'),
  },
  {
    category: 'situational',
    question:
      'Just before an important demo, you discover a production bug caused by your own code. What do you do?',
    companyTags: ['amazon'],
    starGuidance: [
      '- Ownership under pressure: **assess impact → inform the team immediately → propose the fix-or-workaround decision**. Hiding it until after the demo is the fail case.',
      '- Show impact triage: who is affected, is data at risk, can it safely wait two hours?',
      '- Amazon lens: *Ownership + Earn Trust* — you caused it, you surface it, you fix it, and afterwards you write down why it happened.',
    ].join('\n'),
    sampleOutline: [
      '- The 5-minute impact assessment: blast radius, data risk, urgency',
      '- Who you would tell and exactly what you would say (severity + options)',
      '- The demo call: workaround / known-issue script vs. delay — with your recommendation',
      '- Afterwards: the fix + the small postmortem note',
    ].join('\n'),
  },
  {
    category: 'situational',
    question:
      "You believe the team's technical approach is wrong, but everyone else agrees with it. What do you do?",
    companyTags: ['amazon'],
    starGuidance: [
      '- *Have Backbone; Disagree and Commit* — voice the concern once, well: a specific risk, evidence, and a cheap test to settle it.',
      '- The strong move is proposing a **falsifiable check** (spike, benchmark, prototype) instead of relitigating opinions.',
      '- If the team still says no: commit genuinely, and define the early-warning sign that would trigger a revisit.',
    ].join('\n'),
    sampleOutline: [
      '- Your concern stated as a specific risk, not a matter of taste',
      '- The cheap experiment you would propose to decide it objectively',
      '- If overruled: the commit + the agreed tripwire metric',
      '- Why this beats both silence and stubbornness',
    ].join('\n'),
  },
  {
    category: 'situational',
    question: 'The company asks you to relocate to another city two weeks after joining. How do you respond?',
    companyTags: ['tcs', 'infosys', 'wipro', 'cognizant', 'capgemini'],
    starGuidance: [
      '- Services companies genuinely need mobility — decide your true answer **before** the interview; a false yes becomes a real problem at posting time.',
      '- A clean yes: frame relocation as early-career upside (new city, new project exposure, independence).',
      '- A constrained yes: state the constraint honestly plus the flexibility you *do* have — honesty with a workable frame beats an enthusiastic lie.',
    ].join('\n'),
    sampleOutline: [
      '- Your direct answer, first',
      '- The reasoning: career stage, family situation — kept brief',
      '- What you would ask about logistics (notice period, support) — realism, not resistance',
      '- The commitment line to close',
    ].join('\n'),
  },
  {
    category: 'situational',
    question: 'Estimate the number of coffee shops in your city.',
    companyTags: ['deloitte', 'zs-associates'],
    starGuidance: [
      '- Nobody cares about the number — they are grading the **structure**: population → demand segmentation → supply math, narrated aloud.',
      '- Rules: round numbers aggressively, state every assumption explicitly, sanity-check the final result against something you know.',
      '- Asking 1-2 clarifying questions first is good, not weak: city boundaries? chains and independents both?',
    ].join('\n'),
    sampleOutline: [
      '- Clarify scope: city limits, what counts as a coffee shop',
      '- Demand side: population → share who drink coffee out → visits per week',
      '- Supply side: customers one shop serves per day → shops needed to meet demand',
      '- Sanity check against a known area + a confident final range',
    ].join('\n'),
  },
  {
    category: 'situational',
    question:
      'Six months after joining us, you receive a significantly higher offer from another company. What do you do?',
    starGuidance: [
      '- The interviewer is testing your model of commitment — weigh learning, growth, and your given word, not just CTC.',
      '- Avoid both extremes: "I would never look" (naive) and "I would obviously take it" (mercenary). The mature frame: at six months you are mid-investment; money alone would not move you, a broken growth promise might.',
      '- If a service agreement applies, acknowledge plainly that you honor commitments you sign.',
    ].join('\n'),
    sampleOutline: [
      '- Your actual decision framework: learning curve, promises kept, team quality',
      '- Why six months is too early to convert learning into cash',
      '- The honest caveat: what *would* make you look eventually',
      '- One line on honoring the commitments you made',
    ].join('\n'),
  },
];

async function main() {
  console.log(`🧹 Clearing HrQuestion table (bank is authoritative)…`);
  await prisma.hrQuestion.deleteMany({});

  console.log(`🌱 Seeding ${BANK.length} HR & behavioral questions…`);
  await prisma.hrQuestion.createMany({
    data: BANK.map((q, i) => ({
      question: q.question,
      category: q.category,
      starGuidance: q.starGuidance,
      sampleOutline: q.sampleOutline,
      companyTags: q.companyTags ?? [],
      sortOrder: (i + 1) * 10,
    })),
  });

  const byCategory = await prisma.hrQuestion.groupBy({ by: ['category'], _count: { category: true } });
  for (const g of byCategory) console.log(`   ${g.category}: ${g._count.category}`);
  console.log(`✅ Done — ${await prisma.hrQuestion.count()} HR questions seeded.`);
}

main()
  .catch((e) => {
    console.error('❌ HR seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
