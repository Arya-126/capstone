import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds pipeline / diagnostic / belt achievements. Idempotent — upserts by
// slug. Category 'pipeline' groups these in the Trophy Room separately from
// the 'interview' and 'domain'/'general' catalogs.
//
// Condition types map to switch branches in achievementService.ts:
//   diagnostic_taken   — user has skillProfile.diagnosticAt
//   belt_at_least      — { value: 'Bronze'|'Silver'|'Gold'|'Platinum'|'Diamond' }
//   pipeline_stage_count — { value: N } total stages completed across pipelines
//   pipeline_finished  — { value: N } whole pipelines closed out

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
  {
    slug: 'first_diagnostic',
    name: 'Map the Terrain',
    description: 'Complete your first-login diagnostic.',
    icon: '🗺️',
    category: 'pipeline',
    xpReward: 150,
    condition: { type: 'diagnostic_taken' },
  },
  // Belt ladder — each is a one-time hit at that tier
  {
    slug: 'bronze_belt',
    name: 'Bronze Belt',
    description: 'Reach Bronze rank on the diagnostic.',
    icon: '🥉',
    category: 'pipeline',
    xpReward: 100,
    condition: { type: 'belt_at_least', value: 'Bronze' },
  },
  {
    slug: 'silver_belt',
    name: 'Silver Belt',
    description: 'Reach Silver rank — average level 2+ across pillars.',
    icon: '🥈',
    category: 'pipeline',
    xpReward: 250,
    condition: { type: 'belt_at_least', value: 'Silver' },
  },
  {
    slug: 'gold_belt',
    name: 'Gold Belt',
    description: 'Reach Gold rank — average level 3+ across pillars.',
    icon: '🥇',
    category: 'pipeline',
    xpReward: 500,
    condition: { type: 'belt_at_least', value: 'Gold' },
  },
  {
    slug: 'platinum_belt',
    name: 'Platinum Belt',
    description: 'Reach Platinum rank — average level 4+ across pillars.',
    icon: '🏆',
    category: 'pipeline',
    xpReward: 800,
    condition: { type: 'belt_at_least', value: 'Platinum' },
  },
  {
    slug: 'diamond_belt',
    name: 'Diamond Belt',
    description: 'Reach Diamond rank — the top tier. Rare air.',
    icon: '💎',
    category: 'pipeline',
    xpReward: 1200,
    condition: { type: 'belt_at_least', value: 'Diamond' },
  },
  // Pipeline stage / completion milestones
  {
    slug: 'first_stage',
    name: 'First Step',
    description: 'Complete your first pipeline stage.',
    icon: '👣',
    category: 'pipeline',
    xpReward: 100,
    condition: { type: 'pipeline_stage_count', value: 1 },
  },
  {
    slug: 'stage_five',
    name: 'Halfway There',
    description: 'Complete 5 pipeline stages.',
    icon: '⛰️',
    category: 'pipeline',
    xpReward: 250,
    condition: { type: 'pipeline_stage_count', value: 5 },
  },
  {
    slug: 'pipeline_finisher',
    name: 'Pipeline Finisher',
    description: 'Complete every stage in one pipeline.',
    icon: '🏁',
    category: 'pipeline',
    xpReward: 800,
    condition: { type: 'pipeline_finished', value: 1 },
  },
];

async function main() {
  console.log(`🌱 Seeding ${BANK.length} pipeline achievements...`);
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
      await prisma.achievement.create({ data: { ...def, condition: conditionJson } });
      created++;
    }
  }

  const total = await prisma.achievement.count();
  const pipelineCount = await prisma.achievement.count({ where: { category: 'pipeline' } });
  console.log(`✅ Created ${created}, updated ${updated}. Achievement table now: ${total} total (${pipelineCount} pipeline).`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
