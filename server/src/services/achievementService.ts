import { prisma } from '../lib/prisma';
import { awardXp } from './xpService';

// Event union — each event carries the data its condition types need.
// Adding a new condition type = one case here + a matching seed row with
// { type: "..." } in Achievement.condition.
export type AchievementEventType =
  | 'game_completed'
  | 'level_up'
  | 'perfect_score'
  | 'speed_run'
  | 'interview_completed'       // AI mock interview (any round) finished + scored
  | 'quest_completed'           // all milestones on a UserQuest checked off
  | 'diagnostic_completed'      // first-login diagnostic submitted (fires with belt)
  | 'pipeline_stage_completed'  // one PipelineStage crossed its gate
  | 'pipeline_completed';       // entire LearningPipeline done

export interface AchievementEvent {
  type: AchievementEventType;
  userId: string;
  data: any;
}

export async function checkAchievements(event: AchievementEvent) {
  const { userId, type, data } = event;

  // Widened from the game-only include: interviews/quests are needed for
  // the interview-track condition types.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userAchievements: true,
      domainProgress: true,
      gameSessions: true,
      skillProfile: true, // needed for belt / diagnostic conditions
    },
  });
  if (!user) return [];

  const [
    interviewsCompleted,
    questsCompleted,
    problemsSolved,
    pipelineStagesCompleted,
    pipelinesCompleted,
  ] = await Promise.all([
    prisma.aiInterview.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { id: true, roundType: true, overallScore: true, rubricScores: true, endedAt: true },
      orderBy: { endedAt: 'desc' },
    }),
    prisma.userQuest.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.userProblemStatus.count({ where: { userId, status: 'SOLVED' } }),
    // Sum across all of the user's pipelines — a stage completed in a paused
    // pipeline still counts as progress the user made
    prisma.pipelineStage.count({
      where: { pipeline: { userId }, isCompleted: true },
    }),
    prisma.learningPipeline.count({ where: { userId, status: 'COMPLETED' } }),
  ]);

  // Belt ordering — lets `belt_at_least: { value: "Gold" }` compare cleanly
  const BELT_RANK: Record<string, number> = {
    Unranked: 0,
    Bronze: 1,
    Silver: 2,
    Gold: 3,
    Platinum: 4,
    Diamond: 5,
  };

  const earnedAchievementIds = new Set(user.userAchievements.map((ua) => ua.achievementId));
  const allAchievements = await prisma.achievement.findMany();
  const unearned = allAchievements.filter((a) => !earnedAchievementIds.has(a.id));

  const newlyEarned: typeof allAchievements = [];

  for (const achievement of unearned) {
    let earned = false;
    let condition: any;

    try {
      condition = JSON.parse(achievement.condition);
    } catch {
      console.error(`Invalid condition JSON in achievement ${achievement.slug}`);
      continue;
    }

    switch (condition.type) {
      // ---- game-arcade conditions (unchanged) ----
      case 'game_count':
        if (type === 'game_completed' && user.gameSessions.length >= condition.value) earned = true;
        break;
      case 'perfect_score':
        if (type === 'perfect_score') earned = true;
        break;
      case 'speed_run':
        if (type === 'speed_run' && data.durationSec <= condition.seconds) earned = true;
        break;
      case 'domain_count':
        if (user.domainProgress.length >= condition.value) earned = true;
        break;
      case 'domain_level':
        if (type === 'level_up' && data.newLevel >= condition.value) earned = true;
        else if (user.domainProgress.some((p) => p.currentLevel >= condition.value)) earned = true;
        break;
      case 'game_variety':
        if (type === 'game_completed') {
          const uniqueTypes = new Set(user.gameSessions.map((s) => s.gameType));
          if (uniqueTypes.size >= condition.value) earned = true;
        }
        break;
      case 'time_of_day':
        if (type === 'game_completed') {
          const hour = new Date().getHours();
          if (condition.hour === 0 && hour >= 0 && hour < 5) earned = true;
        }
        break;

      // ---- interview-track conditions ----
      // "completed N interviews" — fires on any interview finish
      case 'interview_count':
        if (type === 'interview_completed' && interviewsCompleted.length >= condition.value) earned = true;
        break;

      // "overall score ≥ N (0-100)" — for badges like Interview Ace
      case 'interview_score':
        if (type === 'interview_completed' && (data.overallScore ?? 0) >= condition.value) earned = true;
        break;

      // "any single rubric axis ≥ N (0-5)" — Five Star lands on a 5.0
      case 'rubric_perfect': {
        if (type !== 'interview_completed') break;
        const scores: number[] = Object.values(data.rubricScores || {}).map((v) => Number(v) || 0);
        if (scores.some((v) => v >= (condition.value ?? 5))) earned = true;
        break;
      }

      // "completed at least one of each round type" — Full Spectrum
      case 'round_variety': {
        if (type !== 'interview_completed') break;
        const roundTypes = new Set(interviewsCompleted.map((i) => i.roundType).filter(Boolean));
        const required: string[] = condition.required || ['hr', 'technical', 'coding'];
        if (required.every((r) => roundTypes.has(r))) earned = true;
        break;
      }

      // "improved overall by N% between the two most recent interviews of the same round type"
      case 'interview_improvement': {
        if (type !== 'interview_completed') break;
        const roundType = data.roundType;
        const sameRound = interviewsCompleted.filter(
          (i) => i.roundType === roundType && i.overallScore != null
        );
        if (sameRound.length < 2) break;
        const [latest, previous] = sameRound; // sorted desc by endedAt
        const delta = (latest.overallScore ?? 0) - (previous.overallScore ?? 0);
        if (delta >= (condition.value ?? 20)) earned = true;
        break;
      }

      // "all-tests-passed coding submission during a coding interview"
      case 'coding_interview_ace':
        if (type === 'interview_completed' && data.roundType === 'coding' && data.allPassed) earned = true;
        break;

      // ---- quest-track conditions ----
      case 'quest_count':
        if (type === 'quest_completed' && questsCompleted >= condition.value) earned = true;
        break;

      // ---- cross-cutting ----
      case 'streak_days':
        if ((user.streakDays ?? 0) >= condition.value) earned = true;
        break;

      // "solved N coding problems (total, all-time)"
      case 'coding_solved':
        if (problemsSolved >= condition.value) earned = true;
        break;

      // ---- pipeline / belt / diagnostic conditions ----

      // "took the first-login diagnostic"
      case 'diagnostic_taken':
        if (user.skillProfile?.diagnosticAt) earned = true;
        break;

      // "achieved belt X or higher" — condition.value is a belt name
      case 'belt_at_least': {
        const need = BELT_RANK[condition.value] ?? 0;
        const have = BELT_RANK[user.skillProfile?.overallBelt || 'Unranked'] ?? 0;
        if (have >= need) earned = true;
        break;
      }

      // "completed N pipeline stages (across any pipeline)"
      case 'pipeline_stage_count':
        if (pipelineStagesCompleted >= condition.value) earned = true;
        break;

      // "completed a whole pipeline"
      case 'pipeline_finished':
        if (pipelinesCompleted >= (condition.value ?? 1)) earned = true;
        break;
    }

    if (earned) {
      await prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });
      if (achievement.xpReward > 0) await awardXp(userId, achievement.xpReward);
      newlyEarned.push(achievement);
    }
  }

  return newlyEarned;
}

export async function getUserAchievements(userId: string) {
  const allAchievements = await prisma.achievement.findMany({ orderBy: { createdAt: 'asc' } });
  const userAchievements = await prisma.userAchievement.findMany({ where: { userId } });
  const earnedMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua.earnedAt]));

  return allAchievements.map((a) => ({
    ...a,
    isEarned: earnedMap.has(a.id),
    earnedAt: earnedMap.get(a.id) || null,
  }));
}
