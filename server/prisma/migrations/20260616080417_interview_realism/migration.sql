-- AlterTable
ALTER TABLE "AiInterview" ADD COLUMN     "deliverySignals" JSONB;

-- AlterTable
ALTER TABLE "AiInterviewTurn" ADD COLUMN     "isFollowup" BOOLEAN NOT NULL DEFAULT false;
