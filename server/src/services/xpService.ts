import { prisma } from '../lib/prisma';

export const XP_RULES = {
  correct_easy:         10,
  correct_medium:       18,
  correct_hard:         25,
  speed_bonus:           5,
  daily_streak_7:      100,
  topic_completed:      50,
  weak_topic_mastered: 150,
  perfect_test:        200,
  hint_used:            -5,  // deducted
  // Mini-game base XP (multiplied by score percentage)
  memory_match_base:    80,
  word_scramble_base:   90,
  crossword_base:      120,
  hangman_base:         70,
  fill_blank_base:      85,
  concept_cannon_base: 100,
  // Multipliers
  perfect_game_multiplier:  1.5,
  speed_game_multiplier:    1.2,
  // Interview track — completion base + a bonus per rubric point above 3.0
  interview_hr_base:         60,
  interview_technical_base:  80,
  interview_coding_base:    120,
  interview_full_base:      200,
  interview_score_bonus:     20,  // per rubric point above 3.0 (rubric on 0-5 scale)
  interview_high_score:     150,  // one-shot bonus for overall ≥ 80
  // Quest track
  quest_milestone:           50,  // when a single milestone is checked off
  quest_completed:          200,  // when all milestones done (in addition to quest.xpReward)
};

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3200, 5000, 8000, 12000, 18000];

export function calculateMiniGameXp(
  gameType: string,
  scorePercent: number,
  isPerfect: boolean,
  isFast: boolean
): number {
  const keyMap: Record<string, keyof typeof XP_RULES> = {
    MEMORY_MATCH:    'memory_match_base',
    WORD_SCRAMBLE:   'word_scramble_base',
    CROSSWORD:       'crossword_base',
    HANGMAN:         'hangman_base',
    FILL_BLANK:      'fill_blank_base',
    CONCEPT_CANNON:  'concept_cannon_base',
  };

  const baseKey = keyMap[gameType];
  const base = baseKey ? (XP_RULES[baseKey] as number) : 80;
  let xp = Math.round(base * (scorePercent / 100));

  if (isPerfect) {
    xp = Math.round(xp * XP_RULES.perfect_game_multiplier);
  } else if (isFast) {
    xp = Math.round(xp * XP_RULES.speed_game_multiplier);
  }

  return Math.max(xp, 0);
}

// XP for a completed AI interview. `overallScore` is 0-100 (the aggregated
// rubric percentage stored on AiInterview.overallScore). Round-type sets the
// base; a linear bonus rewards rubric points above the 3.0 midpoint; a flat
// bonus lands at ≥ 80 to reward genuine mastery over grinding.
export function calculateInterviewXp(
  roundType: string,
  overallScore: number,
  rubricScores?: Record<string, number>
): number {
  const baseMap: Record<string, keyof typeof XP_RULES> = {
    hr:        'interview_hr_base',
    technical: 'interview_technical_base',
    coding:    'interview_coding_base',
    full:      'interview_full_base',
  };
  const baseKey = baseMap[roundType] || 'interview_technical_base';
  let xp = XP_RULES[baseKey] as number;

  // rubric bonus: 20 XP per rubric point above 3.0, summed across axes.
  // rubricScores are 0-5; a mediocre 3.0 yields 0 bonus, a strong 4.5 yields
  // (4.5-3.0)*20 = 30 per axis.
  if (rubricScores) {
    let bonus = 0;
    for (const v of Object.values(rubricScores)) {
      const delta = Math.max(0, (Number(v) || 0) - 3.0);
      bonus += delta * XP_RULES.interview_score_bonus;
    }
    xp += Math.round(bonus);
  }

  if (overallScore >= 80) xp += XP_RULES.interview_high_score;
  return Math.max(0, Math.round(xp));
}

export async function awardXp(userId: string, amount: number) {
  await prisma.user.update({ where: { id: userId }, data: { xpTotal: { increment: amount } } });
  await checkLevelUp(userId);
}

async function checkLevelUp(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const newLevel = LEVEL_THRESHOLDS.findLastIndex(t => user.xpTotal >= t) + 1;
  if (newLevel !== user.level)
    await prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
}
