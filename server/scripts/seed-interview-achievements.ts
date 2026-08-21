import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds interview-track achievements. Idempotent — upserts by slug so re-runs
// keep the catalog aligned without duplicating rows or wiping earned badges.
// Category is 'interview' so the trophy room can group these separately from
// the pre-existing game-arcade achievements.
//
// Each `condition` string is JSON parsed by achievementService.ts — the shape
// there dictates what's allowed. When adding a new slug, either match an
// existing condition.type or extend the switch in achievementService.ts.

interface AchievementDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xpReward: number;
  condition: object;
}

const BANK: AchievementDef[] = [
  // ---- interview count milestones ----
  {
    slug: 'ice_breaker',
    name: 'Ice Breaker',
    description: 'Complete your first AI mock interview.',
    icon: '🧊',
    category: 'interview',
    xpReward: 100,
    condition: { type: 'interview_count', value: 1 },
  },
  {
    slug: 'mock_regular',
    name: 'Mock Regular',
    description: 'Complete 5 AI mock interviews.',
    icon: '🎤',
    category: 'interview',
    xpReward: 200,
    condition: { type: 'interview_count', value: 5 },
  },
  {
    slug: 'mock_veteran',
    name: 'Mock Veteran',
    description: 'Complete 10 AI mock interviews.',
    icon: '🎖️',
    category: 'interview',
    xpReward: 500,
    condition: { type: 'interview_count', value: 10 },
  },

  // ---- score-based ----
  {
    slug: 'solid_showing',
    name: 'Solid Showing',
    description: 'Score 60+ overall on any AI interview.',
    icon: '✅',
    category: 'interview',
    xpReward: 150,
    condition: { type: 'interview_score', value: 60 },
  },
  {
    slug: 'interview_ace',
    name: 'Interview Ace',
    description: 'Score 80+ overall on any AI interview.',
    icon: '⭐',
    category: 'interview',
    xpReward: 300,
    condition: { type: 'interview_score', value: 80 },
  },
  {
    slug: 'interview_legend',
    name: 'Interview Legend',
    description: 'Score 90+ overall on any AI interview.',
    icon: '🌟',
    category: 'interview',
    xpReward: 500,
    condition: { type: 'interview_score', value: 90 },
  },
  {
    slug: 'five_star',
    name: 'Five Star',
    description: 'Earn a perfect 5.0 on any rubric axis.',
    icon: '💎',
    category: 'interview',
    xpReward: 250,
    condition: { type: 'rubric_perfect', value: 5 },
  },

  // ---- growth ----
  {
    slug: 'comeback_kid',
    name: 'Comeback Kid',
    description: 'Improve your overall score by 20+ points between two interviews of the same round type.',
    icon: '📈',
    category: 'interview',
    xpReward: 300,
    condition: { type: 'interview_improvement', value: 20 },
  },
  {
    slug: 'full_spectrum',
    name: 'Full Spectrum',
    description: 'Complete at least one interview of each round type (HR, Technical, Coding).',
    icon: '🌈',
    category: 'interview',
    xpReward: 400,
    condition: { type: 'round_variety', required: ['hr', 'technical', 'coding'] },
  },

  // ---- coding-round specific ----
  {
    slug: 'clean_sweep',
    name: 'Clean Sweep',
    description: 'Pass every test case during a coding interview.',
    icon: '🧹',
    category: 'interview',
    xpReward: 250,
    condition: { type: 'coding_interview_ace' },
  },
  {
    slug: 'problem_slayer',
    name: 'Problem Slayer',
    description: 'Solve 10 coding problems across all tests.',
    icon: '⚔️',
    category: 'interview',
    xpReward: 250,
    condition: { type: 'coding_solved', value: 10 },
  },
  {
    slug: 'problem_grandmaster',
    name: 'Problem Grandmaster',
    description: 'Solve 25 coding problems across all tests.',
    icon: '👑',
    category: 'interview',
    xpReward: 500,
    condition: { type: 'coding_solved', value: 25 },
  },

  // ---- quest track ----
  {
    slug: 'quest_starter',
    name: 'Quest Starter',
    description: 'Complete your first learning quest.',
    icon: '🗺️',
    category: 'interview',
    xpReward: 100,
    condition: { type: 'quest_count', value: 1 },
  },
  {
    slug: 'quest_master',
    name: 'Quest Master',
    description: 'Complete 5 learning quests.',
    icon: '🏅',
    category: 'interview',
    xpReward: 400,
    condition: { type: 'quest_count', value: 5 },
  },

  // ---- streaks (cross-cutting) ----
  {
    slug: 'streak_scholar',
    name: 'Streak Scholar',
    description: 'Reach a 7-day study streak.',
    icon: '🔥',
    category: 'interview',
    xpReward: 200,
    condition: { type: 'streak_days', value: 7 },
  },
  {
    slug: 'streak_master',
    name: 'Streak Master',
    description: 'Reach a 30-day study streak.',
    icon: '🏆',
    category: 'interview',
    xpReward: 600,
    condition: { type: 'streak_days', value: 30 },
  },
];

async function main() {
  console.log(`🌱 Seeding ${BANK.length} interview achievements...`);
  let created = 0;
  let updated = 0;

  for (const def of BANK) {
    const existing = await prisma.achievement.findUnique({ where: { slug: def.slug } });
    const conditionJson = JSON.stringify(def.condition);

    if (existing) {
      await prisma.achievement.update({
        where: { slug: def.slug },
        data: {
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          xpReward: def.xpReward,
          condition: conditionJson,
        },
      });
      updated++;
    } else {
      await prisma.achievement.create({
        data: { ...def, condition: conditionJson },
      });
      created++;
    }
  }

  const total = await prisma.achievement.count();
  const interviewCount = await prisma.achievement.count({ where: { category: 'interview' } });
  console.log(`✅ Created ${created}, updated ${updated}. Achievement table now: ${total} total (${interviewCount} interview).`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
