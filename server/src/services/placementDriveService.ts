import { prisma } from '../lib/prisma';
import { startInterview } from './aiInterviewService';
import { diagnoseInterview } from './diagnosisService';

export async function startPlacementDrive(userId: string, companyId?: string, role: string = 'SDE (Generalist)') {
  const drive = await prisma.placementDrive.create({
    data: {
      userId,
      companyId: companyId || null,
      currentStep: 'resume',
      status: 'IN_PROGRESS',
    },
    include: { company: true },
  });
  return drive;
}

export async function attachResumeToDrive(driveId: string, userId: string, resumeData: any) {
  const drive = await prisma.placementDrive.findUnique({
    where: { id: driveId },
  });
  if (!drive || drive.userId !== userId) throw new Error('Placement drive not found');

  const updated = await prisma.placementDrive.update({
    where: { id: driveId },
    data: {
      resumeData,
      currentStep: 'hr',
    },
    include: { company: true },
  });
  return updated;
}

export async function startDriveRound(
  driveId: string,
  userId: string,
  roundType: 'hr' | 'technical' | 'coding',
  role: string = 'SDE (Generalist)'
) {
  const drive = await prisma.placementDrive.findUnique({
    where: { id: driveId },
  });
  if (!drive || drive.userId !== userId) throw new Error('Placement drive not found');

  const interview = await startInterview(
    userId,
    role,
    drive.companyId || undefined,
    roundType,
    drive.resumeData || undefined
  );

  const updateData: any = { currentStep: roundType };
  if (roundType === 'hr') updateData.hrInterviewId = interview.id;
  if (roundType === 'technical') updateData.techInterviewId = interview.id;
  if (roundType === 'coding') updateData.codingInterviewId = interview.id;

  await prisma.placementDrive.update({
    where: { id: driveId },
    data: updateData,
  });

  return { driveStep: roundType, interview };
}

export async function completePlacementDrive(driveId: string, userId: string) {
  const drive = await prisma.placementDrive.findUnique({
    where: { id: driveId },
    include: { company: true },
  });
  if (!drive || drive.userId !== userId) throw new Error('Placement drive not found');

  const roundIds = [drive.hrInterviewId, drive.techInterviewId, drive.codingInterviewId].filter(Boolean) as string[];

  const interviews = await prisma.aiInterview.findMany({
    where: { id: { in: roundIds } },
    include: { turns: true },
  });

  let totalScore = 0;
  let scoredRoundsCount = 0;

  for (const iv of interviews) {
    if (iv.overallScore != null) {
      totalScore += iv.overallScore;
      scoredRoundsCount++;
    }
    // ensure diagnosis generated
    try {
      await diagnoseInterview(iv.id, userId);
    } catch {
      /* ignore if already diagnosed */
    }
  }

  const overallScore = scoredRoundsCount > 0 ? Math.round((totalScore / scoredRoundsCount) * 10) / 10 : 70;

  let overallVerdict = 'Needs Practice';
  if (overallScore >= 82) overallVerdict = 'Placement Ready';
  else if (overallScore >= 65) overallVerdict = 'Almost Placement-Ready';

  const updated = await prisma.placementDrive.update({
    where: { id: driveId },
    data: {
      status: 'COMPLETED',
      currentStep: 'report',
      overallScore,
      overallVerdict,
      completedAt: new Date(),
    },
    include: { company: true },
  });

  return {
    drive: updated,
    interviews,
  };
}

export async function getPlacementDrive(driveId: string, userId: string) {
  const drive = await prisma.placementDrive.findUnique({
    where: { id: driveId },
    include: { company: true },
  });
  if (!drive || drive.userId !== userId) throw new Error('Placement drive not found');

  const roundIds = [drive.hrInterviewId, drive.techInterviewId, drive.codingInterviewId].filter(Boolean) as string[];
  const interviews = await prisma.aiInterview.findMany({
    where: { id: { in: roundIds } },
    include: { turns: true },
  });

  return {
    drive,
    interviews,
  };
}
