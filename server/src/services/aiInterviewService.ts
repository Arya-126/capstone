import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { chat, extractJson, ChatMessage } from './llmService';
import { diagnoseInterview } from './diagnosisService';
import { awardXp, calculateInterviewXp } from './xpService';
import { checkAchievements } from './achievementService';
import { checkPipelineGates } from './pipelineService';

// Conversational mock interview backed by AiInterview/AiInterviewTurn.
// Prompts live in server/ai/prompts/*.md so they can be edited without
// touching code. Scoring is rubric-based with defensive JSON parsing.

const MAX_QUESTIONS = 6;
const PROMPT_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');

const TECHNICAL_RUBRIC_WEIGHTS: Record<string, number> = {
  technical: 0.3,
  problemSolving: 0.25,
  communication: 0.2,
  structure: 0.15,
  roleFit: 0.1,
};

const HR_RUBRIC_WEIGHTS: Record<string, number> = {
  starStructure: 0.25,
  communication: 0.2,
  selfAwareness: 0.2,
  cultureFit: 0.2,
  professionalism: 0.15,
};

function loadPrompt(name: string, vars: Record<string, string | number>): string {
  let text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, String(value));
  }
  return text;
}

async function loadInterview(interviewId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { order: 'asc' } }, company: true },
  });
  if (!interview || interview.userId !== userId) throw new Error('Interview not found');
  return interview;
}

function transcriptMessages(turns: { role: string; content: string }[]): ChatMessage[] {
  return turns.map((t) => ({
    role: t.role === 'INTERVIEWER' ? ('assistant' as const) : ('user' as const),
    content: t.content,
  }));
}

const MAX_FOLLOWUPS_PER_QUESTION = 1;

function questionProgress(turns: { role: string; isFollowup?: boolean }[]) {
  const interviewer = turns.filter((t) => t.role === 'INTERVIEWER');
  const baseQuestionsAsked = interviewer.filter((t) => !t.isFollowup).length;
  let followupsOnCurrent = 0;
  for (let i = interviewer.length - 1; i >= 0; i--) {
    if (interviewer[i].isFollowup) followupsOnCurrent++;
    else break;
  }
  return { baseQuestionsAsked, followupsOnCurrent };
}

async function nextInterviewerTurn(interview: {
  id: string;
  role: string;
  roundType?: string;
  selectedQuestionIds?: string[];
  resumeData?: any;
  company: { name: string; profile?: any } | null;
  turns: { role: string; content: string; order: number; isFollowup?: boolean }[];
}) {
  const { baseQuestionsAsked, followupsOnCurrent } = questionProgress(interview.turns);
  const styleNotes =
    (interview.company?.profile as any)?.interviewStyle ||
    'No company-specific notes — use a general professional style.';

  const isHr = interview.roundType === 'hr';
  const isTech = interview.roundType === 'technical' || !interview.roundType;

  let selectedQuestionsStr = 'Standard HR behavioral set';
  let resumeContextStr = 'No resume uploaded — evaluate based on candidate role.';
  let coreQuestionsStr = 'Standard Computer Science fundamentals (OS, DBMS, CN, SQL)';

  if (isHr && interview.selectedQuestionIds && interview.selectedQuestionIds.length > 0) {
    const qRows = await prisma.hrQuestion.findMany({
      where: { id: { in: interview.selectedQuestionIds } },
    });
    if (qRows.length > 0) {
      selectedQuestionsStr = qRows.map((q, idx) => `${idx + 1}. [${q.category}] ${q.question}`).join('\n');
    }
  }

  if (isTech) {
    if (interview.resumeData) {
      const rd = interview.resumeData as any;
      const skills = Array.isArray(rd.skills) ? rd.skills.join(', ') : 'Not specified';
      const projects = Array.isArray(rd.projects)
        ? rd.projects.map((p: any) => `- ${p.title}: ${p.description || ''} (Tech: ${Array.isArray(p.tech) ? p.tech.join(', ') : ''})`).join('\n')
        : 'None listed';
      const internships = Array.isArray(rd.internships)
        ? rd.internships.map((i: any) => `- ${i.company} (${i.role || 'Intern'}): ${Array.isArray(i.highlights) ? i.highlights.join('; ') : ''}`).join('\n')
        : 'None listed';
      resumeContextStr = `Skills: ${skills}\nProjects:\n${projects}\nExperience/Internships:\n${internships}`;
    }

    if (interview.selectedQuestionIds && interview.selectedQuestionIds.length > 0) {
      const coreRows = await prisma.coreSubjectQuestion.findMany({
        where: { id: { in: interview.selectedQuestionIds } },
      });
      if (coreRows.length > 0) {
        coreQuestionsStr = coreRows.map((c, idx) => `${idx + 1}. [${c.subject}] ${c.question}`).join('\n');
      }
    }
  }

  const promptFile = isHr ? 'hr-interviewer' : isTech ? 'technical-interviewer' : 'interviewer';
  const system = loadPrompt(promptFile, {
    role: interview.role,
    company: interview.company?.name || 'a top tech company',
    maxQuestions: MAX_QUESTIONS,
    baseQuestionsAsked,
    followupsOnCurrent,
    styleNotes,
    selectedQuestions: selectedQuestionsStr,
    resumeContext: resumeContextStr,
    coreQuestions: coreQuestionsStr,
  });

  const history = transcriptMessages(interview.turns);
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...(history.length > 0 ? history : [{ role: 'user' as const, content: 'Hi, I am ready to begin.' }]),
  ];

  // Hard cap: a real interviewer question is 20-100 words. Anything past
  // ~800 chars is the model going off-rails (typically dumping a technical
  // treatise in response to a garbled STT answer — role-confusion).
  const MAX_MESSAGE_CHARS = 800;
  const CLARIFY_FALLBACK =
    "I didn't quite catch that — could you rephrase your answer? Take your time.";

  // Extract the JSON turn, retry once if parse fails. Never fall back to raw
  // model output — that's how 2000-word markdown dumps ended up as the
  // interviewer's spoken turn before.
  async function generateTurn(retryAttempt = 0): Promise<{ kind: string; message: string }> {
    const raw = await chat(messages, { json: true, maxTokens: 400 });
    const parsed = extractJson<{ kind?: string; message?: string }>(raw);
    const rawMsg = (parsed?.message || '').trim();

    if (!rawMsg && retryAttempt < 1) {
      // Reinforce the JSON contract and retry once
      messages.push({
        role: 'user' as const,
        content: 'Reminder: respond with ONLY the JSON object {"kind":"...","message":"..."}. Keep the message under 60 words. Ask ONE question. Do NOT answer on the candidate\'s behalf.',
      });
      return generateTurn(retryAttempt + 1);
    }

    let msg = rawMsg || CLARIFY_FALLBACK;
    // Length guard — first-sentence-preferred truncation if the model rambled
    if (msg.length > MAX_MESSAGE_CHARS) {
      const firstSentence = msg.match(/^[^.!?]{20,}[.!?]/)?.[0];
      msg = (firstSentence || msg.slice(0, MAX_MESSAGE_CHARS)).trim();
    }
    return { kind: (parsed?.kind || '').toLowerCase(), message: msg };
  }

  let { kind, message } = await generateTurn();

  if (baseQuestionsAsked >= MAX_QUESTIONS) {
    kind = 'closing';
  } else if (kind === 'followup' && followupsOnCurrent >= MAX_FOLLOWUPS_PER_QUESTION) {
    kind = 'question';
  } else if (kind !== 'followup' && kind !== 'closing') {
    kind = 'question';
  }

  const turn = await prisma.aiInterviewTurn.create({
    data: {
      interviewId: interview.id,
      role: 'INTERVIEWER',
      content: message,
      order: interview.turns.length,
      isFollowup: kind === 'followup',
    },
  });
  return turn;
}

export async function startInterview(
  userId: string,
  role: string,
  companyId?: string,
  roundType: string = 'technical',
  resumeData?: any
) {
  if (!role?.trim()) throw new Error('role is required');
  const validRoundType = ['hr', 'technical', 'coding', 'full'].includes(roundType) ? roundType : 'technical';

  let selectedQuestionIds: string[] = [];
  if (validRoundType === 'hr') {
    const hrQs = await prisma.hrQuestion.findMany({ take: 40 });
    const shuffled = hrQs.sort(() => 0.5 - Math.random()).slice(0, MAX_QUESTIONS);
    selectedQuestionIds = shuffled.map((q) => q.id);
  } else if (validRoundType === 'technical') {
    const coreQs = await prisma.coreSubjectQuestion.findMany({ take: 50 });
    const shuffled = coreQs.sort(() => 0.5 - Math.random()).slice(0, 3);
    selectedQuestionIds = shuffled.map((q) => q.id);
  } else if (validRoundType === 'coding') {
    const problems = await prisma.codingProblem.findMany({ take: 30 });
    if (problems.length > 0) {
      const shuffled = problems.sort(() => 0.5 - Math.random()).slice(0, 1);
      selectedQuestionIds = shuffled.map((p) => p.id);
    }
  }

  const interview = await prisma.aiInterview.create({
    data: {
      userId,
      role: role.trim(),
      companyId: companyId || null,
      roundType: validRoundType,
      selectedQuestionIds,
      ...(resumeData ? { resumeData } : {}),
    },
    include: { turns: true, company: true },
  });
  await nextInterviewerTurn({ ...interview, turns: [] });
  return getInterview(interview.id, userId);
}

export async function reply(interviewId: string, userId: string, content: string) {
  if (!content?.trim()) throw new Error('Empty answer');
  const interview = await loadInterview(interviewId, userId);
  if (interview.status !== 'IN_PROGRESS') throw new Error('Interview already finished');

  const lastTurn = interview.turns[interview.turns.length - 1];
  if (lastTurn && lastTurn.role === 'CANDIDATE') {
    throw new Error('Please wait for the next question');
  }

  await prisma.aiInterviewTurn.create({
    data: {
      interviewId,
      role: 'CANDIDATE',
      content: content.trim().slice(0, 4000),
      order: interview.turns.length,
    },
  });

  const updated = await loadInterview(interviewId, userId);
  const baseQuestionsAsked = updated.turns.filter(
    (t) => t.role === 'INTERVIEWER' && !t.isFollowup
  ).length;
  await nextInterviewerTurn(updated);

  if (baseQuestionsAsked >= MAX_QUESTIONS) {
    return finishInterview(interviewId, userId);
  }
  return getInterview(interviewId, userId);
}

export async function finishInterview(interviewId: string, userId: string) {
  const interview = await loadInterview(interviewId, userId);
  if (interview.status !== 'IN_PROGRESS') return getInterview(interviewId, userId);

  const candidateTurns = interview.turns.filter((t) => t.role === 'CANDIDATE');
  if (candidateTurns.length === 0) {
    await prisma.aiInterview.update({
      where: { id: interviewId },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
    return getInterview(interviewId, userId);
  }

  const isHr = interview.roundType === 'hr';
  const promptFile = isHr ? 'hr-scorer' : 'scorer';
  const rubricWeights = isHr ? HR_RUBRIC_WEIGHTS : TECHNICAL_RUBRIC_WEIGHTS;

  const transcript = interview.turns
    .map((t) => `[${t.order}] ${t.role}: ${t.content}`)
    .join('\n\n');
  const prompt = loadPrompt(promptFile, {
    role: interview.role,
    company: interview.company?.name || 'a top tech company',
    transcript,
  });

  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 2000 });
  const parsed = extractJson<{
    rubricScores: Record<string, number>;
    turnFeedback: {
      turnOrder: number;
      score: number;
      feedback: string;
      starBreakdown?: any;
      improvedAnswer?: string;
    }[];
    summary: { strengths: string[]; gaps: string[]; nextSteps: string[] };
  }>(raw);

  let rubricScores: Record<string, number> = {};
  let summary: any = null;
  let overall: number | null = null;

  if (parsed?.rubricScores) {
    const clamp = (v: any) => Math.max(0, Math.min(5, Number(v) || 0));
    for (const key of Object.keys(rubricWeights)) rubricScores[key] = clamp(parsed.rubricScores[key]);
    overall =
      Math.round(
        Object.entries(rubricWeights).reduce(
          (sum, [key, w]) => sum + (rubricScores[key] / 5) * w * 100,
          0
        ) * 10
      ) / 10;
    summary = parsed.summary ?? null;

    for (const fb of parsed.turnFeedback || []) {
      const turn = interview.turns.find((t) => t.order === fb.turnOrder && t.role === 'CANDIDATE');
      if (turn) {
        await prisma.aiInterviewTurn.update({
          where: { id: turn.id },
          data: {
            turnScore: clamp(fb.score),
            feedback: String(fb.feedback || '').slice(0, 1000),
            ...(fb.starBreakdown ? { starBreakdown: fb.starBreakdown } : {}),
          },
        });
      }
    }
  }

  await prisma.aiInterview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      endedAt: new Date(),
      overallScore: overall,
      rubricScores: rubricScores as any,
      summary: summary ? JSON.stringify(summary) : null,
    },
  });

  // XP + achievements — award before diagnosis so a slow/failing LLM call
  // never swallows the reward. Wrapped so gamification bugs don't break the
  // primary "did the interview finish and get scored" contract.
  try {
    const xp = calculateInterviewXp(interview.roundType || 'technical', overall ?? 0, rubricScores);
    if (xp > 0) await awardXp(userId, xp);
    await checkAchievements({
      userId,
      type: 'interview_completed',
      data: {
        roundType: interview.roundType || 'technical',
        overallScore: overall ?? 0,
        rubricScores,
      },
    });
    // Pipeline gate: interview mock. Rounds that hit the required score
    // complete stages targeting that round type.
    await checkPipelineGates(userId, {
      type: 'interview-completed',
      roundType: interview.roundType || 'technical',
      overallScore: overall ?? 0,
    });
  } catch (err) {
    console.warn('Interview XP/achievement award failed (non-fatal):', err);
  }

  try {
    await diagnoseInterview(interviewId, userId);
  } catch (err) {
    console.warn('Interview diagnosis failed:', err);
  }

  return getInterview(interviewId, userId);
}

const CODING_RUBRIC_WEIGHTS: Record<string, number> = {
  correctness: 0.35,
  codeQuality: 0.2,
  efficiency: 0.2,
  edgeCases: 0.15,
  problemSolving: 0.1,
};

export async function scoreCodingInterview(
  interviewId: string,
  userId: string,
  payload: {
    problemId: string;
    code: string;
    language: string;
    passed: number;
    total: number;
    elapsedMinutes: number;
  }
) {
  const interview = await loadInterview(interviewId, userId);
  const problem = await prisma.codingProblem.findUnique({
    where: { id: payload.problemId },
  });

  const prompt = loadPrompt('coding-scorer', {
    role: interview.role,
    company: interview.company?.name || 'a top tech company',
    problemTitle: problem?.title || 'Coding Challenge',
    problemDescription: problem?.statement || '',
    language: payload.language,
    submittedCode: payload.code,
    passed: payload.passed,
    total: payload.total,
    elapsedMinutes: payload.elapsedMinutes,
  });

  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 2000 });
  const parsed = extractJson<{
    rubricScores: Record<string, number>;
    complexityAnalysis?: { time: string; space: string };
    alternativeApproach?: string;
    summary: { strengths: string[]; gaps: string[]; nextSteps: string[] };
  }>(raw);

  let rubricScores: Record<string, number> = {};
  let overall: number | null = null;

  if (parsed?.rubricScores) {
    const clamp = (v: any) => Math.max(0, Math.min(5, Number(v) || 0));
    for (const key of Object.keys(CODING_RUBRIC_WEIGHTS)) rubricScores[key] = clamp(parsed.rubricScores[key]);
    overall =
      Math.round(
        Object.entries(CODING_RUBRIC_WEIGHTS).reduce(
          (sum, [key, w]) => sum + (rubricScores[key] / 5) * w * 100,
          0
        ) * 10
      ) / 10;
  }

  const fullSummary = {
    ...(parsed?.summary || { strengths: [], gaps: [], nextSteps: [] }),
    complexityAnalysis: parsed?.complexityAnalysis || { time: 'Unknown', space: 'Unknown' },
    alternativeApproach: parsed?.alternativeApproach || '',
  };

  await prisma.aiInterviewTurn.create({
    data: {
      interviewId,
      role: 'CANDIDATE',
      content: `[Submitted Code - ${payload.language}]\n\n${payload.code}\n\nPassed: ${payload.passed}/${payload.total} test cases`,
      order: interview.turns.length,
      turnScore: overall != null ? Math.round(overall / 20) : 3,
    },
  });

  await prisma.aiInterview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      endedAt: new Date(),
      overallScore: overall,
      rubricScores: rubricScores as any,
      summary: JSON.stringify(fullSummary),
    },
  });

  try {
    const xp = calculateInterviewXp('coding', overall ?? 0, rubricScores);
    if (xp > 0) await awardXp(userId, xp);
    await checkAchievements({
      userId,
      type: 'interview_completed',
      data: {
        roundType: 'coding',
        overallScore: overall ?? 0,
        rubricScores,
        codingPassed: payload.passed,
        codingTotal: payload.total,
        allPassed: payload.passed === payload.total && payload.total > 0,
      },
    });
    // Pipeline gate: coding round mock
    await checkPipelineGates(userId, {
      type: 'interview-completed',
      roundType: 'coding',
      overallScore: overall ?? 0,
      allPassed: payload.passed === payload.total && payload.total > 0,
    });
  } catch (err) {
    console.warn('Coding interview XP/achievement award failed (non-fatal):', err);
  }

  try {
    await diagnoseInterview(interviewId, userId);
  } catch (err) {
    console.warn('Coding interview diagnosis failed:', err);
  }

  return getInterview(interviewId, userId);
}

const PROCTORING_KEYS = new Set(['FACE_NOT_DETECTED', 'MULTIPLE_FACES', 'NO_CAMERA', 'faceChecks']);

export async function recordProctoringSummary(
  interviewId: string,
  userId: string,
  counts: Record<string, number>
) {
  const interview = await loadInterview(interviewId, userId);
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts || {})) {
    if (PROCTORING_KEYS.has(key)) clean[key] = Math.max(0, Math.min(10000, Number(value) || 0));
  }
  await prisma.aiInterview.update({
    where: { id: interview.id },
    data: { proctoringSummary: clean as any },
  });
  return { ok: true };
}

export async function getInterview(interviewId: string, userId: string) {
  const interview = await loadInterview(interviewId, userId);
  return {
    id: interview.id,
    role: interview.role,
    roundType: interview.roundType ?? 'technical',
    company: interview.company?.name ?? null,
    status: interview.status,
    startedAt: interview.startedAt,
    endedAt: interview.endedAt,
    overallScore: interview.overallScore,
    rubricScores: interview.rubricScores,
    summary: interview.summary ? JSON.parse(interview.summary) : null,
    proctoringSummary: interview.proctoringSummary ?? null,
    deliverySignals: interview.deliverySignals ?? null,
    resumeData: interview.resumeData ?? null,
    maxQuestions: MAX_QUESTIONS,
    turns: interview.turns.map((t) => ({
      order: t.order,
      role: t.role,
      content: t.content,
      turnScore: t.turnScore,
      feedback: t.feedback,
      starBreakdown: t.starBreakdown,
      isFollowup: t.isFollowup,
    })),
  };
}

export async function recordDelivery(
  interviewId: string,
  userId: string,
  signals: { avgWpm?: number; totalFillers?: number; voiceAnswers?: number; answers?: any[] }
) {
  const interview = await loadInterview(interviewId, userId);
  const clamp = (n: any, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  const clean = {
    avgWpm: clamp(signals?.avgWpm, 600),
    totalFillers: clamp(signals?.totalFillers, 10000),
    voiceAnswers: clamp(signals?.voiceAnswers, 1000),
    answers: Array.isArray(signals?.answers)
      ? signals.answers.slice(0, 50).map((a: any) => ({
          wpm: clamp(a?.wpm, 600),
          words: clamp(a?.words, 100000),
          durationSec: clamp(a?.durationSec, 100000),
          fillers: clamp(a?.fillers, 10000),
        }))
      : [],
  };
  await prisma.aiInterview.update({
    where: { id: interview.id },
    data: { deliverySignals: clean as any },
  });
  return { ok: true };
}

export async function listInterviews(userId: string) {
  const interviews = await prisma.aiInterview.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: {
      id: true, role: true, roundType: true, status: true, startedAt: true, overallScore: true,
      company: { select: { name: true } },
    },
  });
  return interviews;
}
