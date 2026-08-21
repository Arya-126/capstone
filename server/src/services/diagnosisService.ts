import { prisma } from '../lib/prisma';

export interface WeakArea {
  area: string;
  score: number;
  advice: string;
}

export interface StrongArea {
  area: string;
  score: number;
}

export interface TopicMapping {
  subject: string;
  topicName: string;
  actionUrl: string;
}

const TOPIC_ACTION_MAP: Record<string, { topicName: string; actionUrl: string }> = {
  'star structure': { topicName: 'HR STAR Method Guide', actionUrl: 'hr-prep' },
  'star': { topicName: 'HR STAR Method Guide', actionUrl: 'hr-prep' },
  'communication': { topicName: 'Verbal Ability & Phrasing', actionUrl: 'interview-hub' },
  'self awareness': { topicName: 'Self-Reflection Questions', actionUrl: 'hr-prep' },
  'culture fit': { topicName: 'Company Values & Fit', actionUrl: 'hr-prep' },
  'operating system': { topicName: 'OS Process & Memory Management', actionUrl: 'core-cs-hub' },
  'os': { topicName: 'Operating Systems Practice', actionUrl: 'core-cs-hub' },
  'dbms': { topicName: 'DBMS Normalization & ACID', actionUrl: 'core-cs-hub' },
  'sql': { topicName: 'SQL JOINs & Subqueries', actionUrl: 'core-cs-hub' },
  'cn': { topicName: 'Computer Networks & OSI', actionUrl: 'core-cs-hub' },
  'network': { topicName: 'Computer Networks', actionUrl: 'core-cs-hub' },
  'correctness': { topicName: 'DSA Problem Tracks', actionUrl: 'coding-tracks' },
  'edge cases': { topicName: 'Boundary Testing Drills', actionUrl: 'coding-tracks' },
  'efficiency': { topicName: 'Time & Space Complexity', actionUrl: 'coding-tracks' },
};

export async function diagnoseInterview(interviewId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { order: 'asc' } } },
  });

  if (!interview || interview.userId !== userId) {
    throw new Error('Interview not found');
  }

  const roundType = interview.roundType || 'technical';
  const rubric = (interview.rubricScores as Record<string, number>) || {};
  const summaryObj = interview.summary ? JSON.parse(interview.summary) : null;
  const gaps: string[] = summaryObj?.gaps || [];
  const strengths: string[] = summaryObj?.strengths || [];

  const weakAreas: WeakArea[] = [];
  const strongAreas: StrongArea[] = [];
  const topicMappings: TopicMapping[] = [];

  // Rubric analysis
  for (const [key, val] of Object.entries(rubric)) {
    const numScore = Number(val) || 0;
    if (numScore < 3.5) {
      weakAreas.push({
        area: key,
        score: numScore,
        advice: `Improve performance in ${key} (Score: ${numScore}/5).`,
      });

      const keyLower = key.toLowerCase();
      if (TOPIC_ACTION_MAP[keyLower]) {
        topicMappings.push({
          subject: key,
          ...TOPIC_ACTION_MAP[keyLower],
        });
      }
    } else {
      strongAreas.push({
        area: key,
        score: numScore,
      });
    }
  }

  // Summary gap analysis
  for (const gapText of gaps) {
    const textLower = gapText.toLowerCase();
    for (const [kw, mapVal] of Object.entries(TOPIC_ACTION_MAP)) {
      if (textLower.includes(kw) && !topicMappings.some((t) => t.topicName === mapVal.topicName)) {
        topicMappings.push({
          subject: kw.toUpperCase(),
          ...mapVal,
        });
      }
    }
  }

  // Default topic mapping fallback if none matched
  if (topicMappings.length === 0) {
    if (roundType === 'hr') {
      topicMappings.push({ subject: 'HR', topicName: 'HR STAR Method', actionUrl: 'hr-prep' });
    } else if (roundType === 'coding') {
      topicMappings.push({ subject: 'Coding', topicName: 'DSA Problem Tracks', actionUrl: 'coding-tracks' });
    } else {
      topicMappings.push({ subject: 'Core CS', topicName: 'Core CS Drills', actionUrl: 'core-cs-hub' });
    }
  }

  const overallScore = interview.overallScore || 0;
  let overallVerdict = 'needs-practice';
  if (overallScore >= 80) overallVerdict = 'interview-ready';
  else if (overallScore >= 60) overallVerdict = 'almost-ready';

  const diagnosis = await prisma.interviewDiagnosis.upsert({
    where: { interviewId },
    create: {
      interviewId,
      weakAreas: weakAreas as any,
      strongAreas: strongAreas as any,
      topicMappings: topicMappings as any,
      overallVerdict,
    },
    update: {
      weakAreas: weakAreas as any,
      strongAreas: strongAreas as any,
      topicMappings: topicMappings as any,
      overallVerdict,
    },
  });

  // Auto-generate active quests for user based on diagnosis
  await generateQuestsFromDiagnosis(userId, roundType, topicMappings, weakAreas);

  return diagnosis;
}

export async function generateQuestsFromDiagnosis(
  userId: string,
  roundType: string,
  topicMappings: TopicMapping[],
  weakAreas: WeakArea[]
) {
  // Prevent duplicate active quests
  const activeQuests = await prisma.userQuest.findMany({
    where: { userId, status: 'ACTIVE' },
  });

  const category = roundType === 'hr' ? 'HR' : roundType === 'coding' ? 'CODING' : 'TECH';

  for (const tm of topicMappings.slice(0, 2)) {
    const questTitle = `Quest: Master ${tm.topicName}`;
    if (activeQuests.some((q) => q.title === questTitle)) continue;

    const milestones = [
      { step: 1, text: `Review theory and concepts for ${tm.topicName}`, completed: false },
      { step: 2, text: `Complete practice drill session for ${tm.subject}`, completed: false },
      { step: 3, text: `Retake ${roundType} interview round and achieve 3.5+ score`, completed: false },
    ];

    await prisma.userQuest.create({
      data: {
        userId,
        title: questTitle,
        category,
        description: `Targeted learning path generated from your recent ${roundType} interview analysis.`,
        milestones: milestones as any,
        xpReward: 150,
      },
    });
  }
}
