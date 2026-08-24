import { prisma } from '../lib/prisma';
import { awardXp, XP_RULES } from './xpService';
import { checkAchievements } from './achievementService';

// Personalized learning pipeline — generated once from a UserSkillProfile,
// walked stage-by-stage by the user, gates auto-completed by activity hooks.
//
// Design (see plan.md "Plan Addendum: Personalized Learning Pipeline"):
// - Deterministic generator — same profile in, same stages out (modulo the
//   picks it makes when several subtopics tie for weakest).
// - Stages interleave pillars so users don't grind one thing for 5 stages.
// - Gates use the same event-hook pattern that XP/achievements already use —
//   no polling job. Every activity handler that could complete a gate calls
//   checkPipelineGates with a typed event, and the service walks unlocked
//   stages and marks anything that matches.
// - First stage of a fresh pipeline is unlocked; others unlock as the previous
//   one completes.

// ---- constants ----

const TARGET_LEVEL = 4; // stages walk each pillar up to this level (Proficient)
const MAX_STAGES = 15;

// Subtopic → pillar mapping. Keeps stage titles honest about which pillar
// they belong to. Matches the subtopics emitted by diagnosticService.
const SUBTOPIC_TO_PILLAR: Record<string, 'aptitude' | 'coreCS' | 'coding'> = {
  Quantitative: 'aptitude',
  Logical: 'aptitude',
  Verbal: 'aptitude',
  CN: 'coreCS',
  OS: 'coreCS',
  DBMS: 'coreCS',
  SQL: 'coreCS',
  DSA: 'coding',
};

// Which InterviewCategory slug matches an aptitude subtopic. Used to point
// the user at the right quiz page.
const APTITUDE_SUBTOPIC_CATEGORY: Record<string, string> = {
  Quantitative: 'quantitative-aptitude',
  Logical: 'logical-reasoning',
  Verbal: 'verbal-ability',
};

// A default weak subtopic per pillar — used when the diagnostic didn't
// surface anything (undiagnosed pillar). Keeps the pipeline from crashing on
// users who skipped a section.
const PILLAR_DEFAULT_SUBTOPIC: Record<'aptitude' | 'coreCS' | 'coding', string> = {
  aptitude: 'Quantitative',
  coreCS: 'OS',
  coding: 'DSA',
};

// ---- generator ----

interface StageDraft {
  pillar: string;
  level: number;
  title: string;
  description: string;
  gateType: string;
  gateMeta: any;
}

function minScoreForLevel(level: number): number {
  // level 2 → 65, 3 → 72, 4 → 80, 5 → 88 — climbs with the ladder
  return 55 + level * 7;
}

// Pick the weakest subtopic in a pillar; ties broken by preferred order
function weakestSubtopic(
  breakdown: Record<string, number>,
  pillar: 'aptitude' | 'coreCS' | 'coding',
): string {
  const inPillar = Object.entries(breakdown).filter(
    ([sub]) => SUBTOPIC_TO_PILLAR[sub] === pillar,
  );
  if (inPillar.length === 0) return PILLAR_DEFAULT_SUBTOPIC[pillar];
  inPillar.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return inPillar[0][0];
}

function buildAptitudeStage(subtopic: string, level: number): StageDraft {
  const categorySlug = APTITUDE_SUBTOPIC_CATEGORY[subtopic] || 'quantitative-aptitude';
  const min = minScoreForLevel(level);
  return {
    pillar: 'aptitude',
    level,
    title: `${subtopic} aptitude → L${level}`,
    description: `Score ${min}%+ on a ${subtopic} quiz to consolidate this level.`,
    gateType: 'quiz',
    gateMeta: {
      source: 'interview-category',   // hits InterviewQuestion via categorySlug
      categorySlug,
      subtopic,
      minScore: min,
      questionCount: 10,
    },
  };
}

function buildCoreCSStage(subject: string, level: number): StageDraft {
  const min = minScoreForLevel(level);
  return {
    pillar: 'coreCS',
    level,
    title: `${subject} → L${level}`,
    description: `Score ${min}%+ on a ${subject} core-CS quiz to level up.`,
    gateType: 'quiz',
    gateMeta: {
      source: 'core-subject',         // hits CoreSubjectQuestion via subject
      subject,
      minScore: min,
      questionCount: 10,
    },
  };
}

function buildCodingStage(topicSlug: string, level: number): StageDraft {
  const minSolved = level <= 2 ? 2 : level === 3 ? 3 : 4;
  return {
    pillar: 'coding',
    level,
    title: `${topicSlug.replace(/-/g, ' ')} → L${level}`,
    description: `Solve ${minSolved} coding problem(s) tagged ${topicSlug}.`,
    gateType: 'coding-solve',
    gateMeta: {
      topicSlug,
      minSolved,
    },
  };
}

// Milestone stages sprinkled between pillar stages to break the monotony
function hrMockStage(): StageDraft {
  return {
    pillar: 'comm',
    level: 2,
    title: 'HR mock interview',
    description: 'Complete an HR-round AI mock interview scoring 60+.',
    gateType: 'interview',
    gateMeta: { roundType: 'hr', minOverallScore: 60 },
  };
}
function techMockStage(): StageDraft {
  return {
    pillar: 'comm',
    level: 3,
    title: 'Technical mock interview',
    description: 'Complete a technical AI mock scoring 65+.',
    gateType: 'interview',
    gateMeta: { roundType: 'technical', minOverallScore: 65 },
  };
}
function codingMockStage(): StageDraft {
  return {
    pillar: 'comm',
    level: 4,
    title: 'Live coding interview',
    description: 'Complete a coding round scoring 60+ with all tests passing.',
    gateType: 'interview',
    gateMeta: { roundType: 'coding', minOverallScore: 60 },
  };
}

// Round-robin generator. For each pillar with level < target, queue stages
// (current+1 → target). Interleave by rotating through pillars so no pillar
// dominates the head of the list.
export interface PipelineFocus {
  focus?: 'balanced' | 'placement-6w' | 'coding-only';
  targetCompany?: string | null;
}

export async function generatePipelineStages(
  profile: {
    aptitudeLevel: number;
    coreCSLevel: number;
    codingLevel: number;
    breakdown: any;
  },
  opts: PipelineFocus = {},
): Promise<StageDraft[]> {
  const focus = opts.focus || 'balanced';
  const breakdown: Record<string, number> = (profile.breakdown as any) || {};

  // per-pillar queues of stages to raise level from (currentLevel+1) → TARGET_LEVEL
  const perPillarQueues: Record<'aptitude' | 'coreCS' | 'coding', StageDraft[]> = {
    aptitude: [],
    coreCS: [],
    coding: [],
  };

  if (focus !== 'coding-only') {
    // aptitude progression
    for (let lvl = Math.max(1, profile.aptitudeLevel) + (profile.aptitudeLevel > 0 ? 1 : 0); lvl <= TARGET_LEVEL; lvl++) {
      const sub = weakestSubtopic(breakdown, 'aptitude');
      perPillarQueues.aptitude.push(buildAptitudeStage(sub, lvl));
    }
    // coreCS progression — rotate through weak subjects for variety
    const csSubjectsRanked = ['CN', 'OS', 'DBMS', 'SQL']
      .map((s) => [s, breakdown[s] ?? profile.coreCSLevel] as [string, number])
      .sort((a, b) => a[1] - b[1]);
    let ci = 0;
    for (let lvl = Math.max(1, profile.coreCSLevel) + (profile.coreCSLevel > 0 ? 1 : 0); lvl <= TARGET_LEVEL; lvl++) {
      const sub = csSubjectsRanked[ci % csSubjectsRanked.length][0];
      ci++;
      perPillarQueues.coreCS.push(buildCoreCSStage(sub, lvl));
    }
  }

  // coding progression — walk through DSA topics from easiest to hardest by
  // curriculum order rather than by user breakdown (DSA only has 'DSA' as a
  // breakdown subtopic — no per-topic diagnostic signal to work from)
  const CODING_LADDER = [
    'arrays', 'strings', 'two-pointers', 'binary-search', 'stacks-queues',
    'sliding-window', 'linked-list', 'recursion-backtracking', 'heaps',
    'greedy', 'trees', 'graphs', 'dynamic-programming',
  ];
  let li = 0;
  for (let lvl = Math.max(1, profile.codingLevel) + (profile.codingLevel > 0 ? 1 : 0); lvl <= TARGET_LEVEL; lvl++) {
    const topic = CODING_LADDER[li % CODING_LADDER.length];
    li++;
    perPillarQueues.coding.push(buildCodingStage(topic, lvl));
  }
  if (focus === 'coding-only') {
    // extend deeper — coding-only wants a longer coding ladder
    for (let lvl = TARGET_LEVEL + 1; lvl <= 5 && perPillarQueues.coding.length < MAX_STAGES; lvl++) {
      for (let extra = 0; extra < 3 && perPillarQueues.coding.length < MAX_STAGES; extra++) {
        const topic = CODING_LADDER[li % CODING_LADDER.length];
        li++;
        perPillarQueues.coding.push(buildCodingStage(topic, lvl));
      }
    }
  }

  // interleave — round-robin picks from queues that still have items
  const order: ('aptitude' | 'coreCS' | 'coding')[] =
    focus === 'coding-only'
      ? ['coding']
      : focus === 'placement-6w'
      ? ['coreCS', 'coding', 'aptitude'] // frontload CS for placement
      : ['aptitude', 'coreCS', 'coding'];

  const stages: StageDraft[] = [];
  while (stages.length < MAX_STAGES) {
    let pushed = false;
    for (const pillar of order) {
      const next = perPillarQueues[pillar].shift();
      if (next) {
        stages.push(next);
        pushed = true;
        if (stages.length >= MAX_STAGES) break;
      }
    }
    if (!pushed) break; // all queues drained
  }

  // Sprinkle mock interviews at fixed positions (before saturation)
  const sprinkle = (idx: number, stage: StageDraft) => {
    if (stages.length < idx) return;
    stages.splice(idx, 0, stage);
  };
  if (focus !== 'coding-only') {
    sprinkle(3, hrMockStage());
    sprinkle(7, techMockStage());
  }
  if (stages.length >= 10) {
    sprinkle(Math.min(11, stages.length), codingMockStage());
  }

  return stages.slice(0, MAX_STAGES);
}

// ---- persistence ----

export async function createPipeline(
  userId: string,
  opts: PipelineFocus = {},
): Promise<string> {
  const profile = await prisma.userSkillProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error('Take the diagnostic first — no skill profile exists yet.');

  // if there's already an ACTIVE pipeline, mark it PAUSED — the user gets one
  // active pipeline at a time (prevents drift + accidental duplication)
  await prisma.learningPipeline.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: { status: 'PAUSED' },
  });

  const drafts = await generatePipelineStages(profile, opts);
  if (drafts.length === 0) {
    throw new Error('No pipeline stages could be generated — you might already be at target level.');
  }

  const pipeline = await prisma.learningPipeline.create({
    data: {
      userId,
      focus: opts.focus || 'balanced',
      targetCompany: opts.targetCompany || null,
      stages: {
        create: drafts.map((d, i) => ({
          order: i + 1,
          pillar: d.pillar,
          level: d.level,
          title: d.title,
          description: d.description,
          gateType: d.gateType,
          gateMeta: d.gateMeta,
          isUnlocked: i === 0, // only the first stage starts unlocked
        })),
      },
    },
  });
  return pipeline.id;
}

export async function getCurrentPipeline(userId: string) {
  return prisma.learningPipeline.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      stages: { orderBy: { order: 'asc' } },
    },
  });
}

// ---- inject stages from a TestReport ----
//
// Called by POST /pipeline/current/inject-from-report/:reportId. Reads the
// report's weakConcepts, pulls cached ConceptSynopsis for each, and appends
// one PipelineStage per weak concept to the ACTIVE pipeline. Skips concepts
// that already have a stage targeting them (dedup by pillar+subtopic).
// Returns { added, skipped, alreadyDoneCount }.

const SUBJECT_TO_PILLAR: Record<string, 'aptitude' | 'coreCS' | 'coding' | 'comm'> = {
  Quantitative: 'aptitude',
  Logical: 'aptitude',
  Verbal: 'aptitude',
  Aptitude: 'aptitude',
  CN: 'coreCS',
  OS: 'coreCS',
  DBMS: 'coreCS',
  SQL: 'coreCS',
  CS: 'coreCS',
  DSA: 'coding',
  HR: 'comm',
};

const APTITUDE_SUB_TO_CATEGORY: Record<string, string> = {
  Quantitative: 'quantitative-aptitude',
  Logical: 'logical-reasoning',
  Verbal: 'verbal-ability',
};

export async function injectStagesFromReport(userId: string, reportId: string): Promise<{
  added: number;
  skipped: number;
  pipelineId: string | null;
}> {
  const [pipeline, report] = await Promise.all([
    prisma.learningPipeline.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { stages: { orderBy: { order: 'asc' } } },
    }),
    prisma.testReport.findUnique({ where: { id: reportId } }),
  ]);
  if (!pipeline) return { added: 0, skipped: 0, pipelineId: null };
  if (!report || report.userId !== userId) throw new Error('Report not found');

  const weak = (report.weakConcepts as any[]) || [];
  if (weak.length === 0) return { added: 0, skipped: 0, pipelineId: pipeline.id };

  let orderCursor = pipeline.stages.length > 0
    ? Math.max(...pipeline.stages.map((s) => s.order))
    : 0;
  let added = 0;
  let skipped = 0;

  // The user's current active stage — the very first unlocked-but-incomplete one
  const hasActiveCurrent = pipeline.stages.some((s) => s.isUnlocked && !s.isCompleted);

  for (const w of weak) {
    const subject: string = String(w.subject || '').trim();
    const concept: string = String(w.concept || '').trim();
    if (!subject || !concept) { skipped++; continue; }

    const pillar = SUBJECT_TO_PILLAR[subject] || 'coreCS';

    // Dedup: skip if an existing stage already targets the same subject+concept
    const dup = pipeline.stages.find((s) => {
      const m = (s.gateMeta as any) || {};
      if (s.pillar !== pillar) return false;
      if (m.subject && m.subject === subject) return true;
      if (m.subtopic && m.subtopic === subject) return true;
      if (m.synopsisConcept && m.synopsisConcept === concept) return true;
      return false;
    });
    if (dup) { skipped++; continue; }

    // Pull the cached synopsis (if any) to enrich the stage description
    const syn = await prisma.conceptSynopsis.findUnique({
      where: { subject_concept: { subject, concept } },
    });
    const bullet = (syn?.bulletKeys?.[0] || '').slice(0, 140);

    // Gate: quiz on the appropriate source
    let gateMeta: any = { subject, concept, minScore: 70, questionCount: 10, synopsisConcept: concept };
    if (pillar === 'coreCS') {
      gateMeta = { ...gateMeta, source: 'core-subject', subject: subject === 'CS' ? 'CN' : subject };
    } else if (pillar === 'aptitude') {
      gateMeta = { ...gateMeta, source: 'interview-category', subtopic: subject, categorySlug: APTITUDE_SUB_TO_CATEGORY[subject] };
    } else if (pillar === 'coding') {
      // coding weakness → 2 solved problems, topic-slug agnostic
      gateMeta = { minSolved: 2, subject: 'DSA', concept, synopsisConcept: concept };
    } else if (pillar === 'comm') {
      // HR weakness → complete an HR mock scoring ≥ 60
      gateMeta = { roundType: 'hr', minOverallScore: 60, synopsisConcept: concept };
    }
    if (bullet) gateMeta.synopsisBullet = bullet;

    const gateType =
      pillar === 'coding' ? 'coding-solve' :
      pillar === 'comm'   ? 'interview' :
      'quiz';

    orderCursor++;
    const isFirstOfBatch = added === 0 && !hasActiveCurrent;
    await prisma.pipelineStage.create({
      data: {
        pipelineId: pipeline.id,
        order: orderCursor,
        pillar,
        level: 3, // "from report" stages target level 3 (intermediate)
        title: `Reinforce ${concept} (${subject})`,
        description: bullet
          ? `Focus on ${concept}. ${bullet}`
          : `Address the gap in ${concept} you saw in your report.`,
        gateType,
        gateMeta,
        // If the user has no current unlocked stage, unlock the first injected
        // one immediately so they're not stuck
        isUnlocked: isFirstOfBatch,
      },
    });
    added++;
  }

  return { added, skipped, pipelineId: pipeline.id };
}

// ---- gate checker ----

// Typed event payloads that gate checks consume. Adding a new gateType =
// add an event variant here + a matching branch below.
export type PipelineEvent =
  | {
      type: 'quiz-submitted';
      source: 'interview-category' | 'core-subject';
      subject?: string;      // core-subject: 'CN' | 'OS' | 'DBMS' | 'SQL'
      subtopic?: string;     // interview-category: 'Quantitative' | 'Logical' | 'Verbal'
      categorySlug?: string; // interview-category: category slug
      scorePct: number;      // 0-100
    }
  | {
      type: 'coding-solved';
      problemId: string;
      topicSlug?: string;    // slug from AssessmentTopic
      allPassed: boolean;
    }
  | {
      type: 'interview-completed';
      roundType: string;     // 'hr' | 'technical' | 'coding'
      overallScore: number;  // 0-100
      allPassed?: boolean;   // coding rounds only
    };

// Evaluate a single stage against an event. Pure — no side effects.
function stageMatchesEvent(stage: { gateType: string; gateMeta: any }, event: PipelineEvent): boolean {
  const m = (stage.gateMeta as any) || {};
  if (stage.gateType === 'quiz' && event.type === 'quiz-submitted') {
    if (event.source !== m.source) return false;
    if (m.source === 'core-subject' && event.subject !== m.subject) return false;
    if (m.source === 'interview-category') {
      // match on category or subtopic — either works
      if (m.categorySlug && event.categorySlug && event.categorySlug !== m.categorySlug) return false;
      if (m.subtopic && event.subtopic && event.subtopic !== m.subtopic) return false;
    }
    if (event.scorePct < (m.minScore ?? 70)) return false;
    return true;
  }

  if (stage.gateType === 'coding-solve' && event.type === 'coding-solved') {
    if (!event.allPassed) return false;
    if (m.topicSlug && event.topicSlug && m.topicSlug !== event.topicSlug) return false;
    // "minSolved" is checked by counting live UserProblemStatus rows — the
    // event triggers the check, the DB decides if the threshold is met.
    return true;
  }

  if (stage.gateType === 'interview' && event.type === 'interview-completed') {
    if (m.roundType && event.roundType !== m.roundType) return false;
    if (event.overallScore < (m.minOverallScore ?? 60)) return false;
    return true;
  }

  return false;
}

// Walk unlocked-but-incomplete stages for the user's active pipeline; mark
// any whose gate matched this event as complete, unlock the next one, and
// award XP. Wrapped so gamification bugs don't break the primary handler.
export async function checkPipelineGates(userId: string, event: PipelineEvent): Promise<{
  stagesCompleted: number;
  pipelineCompleted: boolean;
}> {
  const pipeline = await prisma.learningPipeline.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) return { stagesCompleted: 0, pipelineCompleted: false };

  let completedCount = 0;

  for (const stage of pipeline.stages) {
    if (stage.isCompleted || !stage.isUnlocked) continue;
    if (!stageMatchesEvent(stage, event)) continue;

    // coding-solve extra check: does the user have enough SOLVED problems
    // matching the topicSlug now?
    if (stage.gateType === 'coding-solve') {
      const meta = stage.gateMeta as any;
      const solvedMatching = await prisma.userProblemStatus.count({
        where: {
          userId,
          status: 'SOLVED',
          problem: meta?.topicSlug ? { topic: { slug: meta.topicSlug } } : undefined,
        },
      });
      if (solvedMatching < (meta?.minSolved ?? 1)) continue;
    }

    // Mark this stage complete and unlock the next. If the stage was
    // previously skipped, clear the isSkipped flag — completing it wins.
    await prisma.$transaction([
      prisma.pipelineStage.update({
        where: { id: stage.id },
        data: {
          isCompleted: true,
          completedAt: new Date(),
          isSkipped: false,
          skippedAt: null,
        },
      }),
      ...(pipeline.stages
        .filter((s) => s.order === stage.order + 1 && !s.isUnlocked)
        .map((s) =>
          prisma.pipelineStage.update({
            where: { id: s.id },
            data: { isUnlocked: true },
          }),
        )),
    ]);
    completedCount++;

    try {
      await awardXp(userId, XP_RULES.quest_milestone ?? 50);
      await checkAchievements({
        userId,
        type: 'pipeline_stage_completed',
        data: { stageId: stage.id, pillar: stage.pillar, level: stage.level },
      });
    } catch (e) {
      console.warn('Pipeline stage XP/achievement award failed:', e);
    }

    // A single event can only complete one stage — early exit so a huge quiz
    // pass doesn't domino through unrelated locked stages
    break;
  }

  // If every stage is now done, close out the pipeline
  const allDone = pipeline.stages.every((s) => s.isCompleted || s.id === (completedCount > 0 ? undefined : ''));
  let pipelineCompleted = false;
  if (completedCount > 0) {
    const fresh = await prisma.learningPipeline.findUnique({
      where: { id: pipeline.id },
      include: { stages: true },
    });
    if (fresh && fresh.stages.every((s) => s.isCompleted)) {
      await prisma.learningPipeline.update({
        where: { id: pipeline.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      try {
        await awardXp(userId, XP_RULES.quest_completed ?? 200);
        await checkAchievements({
          userId,
          type: 'pipeline_completed',
          data: { pipelineId: pipeline.id },
        });
      } catch {}
      pipelineCompleted = true;
    }
  }

  return { stagesCompleted: completedCount, pipelineCompleted };
}
