-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('ATTEMPTED', 'SOLVED');

-- AlterTable
ALTER TABLE "CodingProblem" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "track" TEXT;

-- CreateTable
CREATE TABLE "UserProblemStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'ATTEMPTED',
    "bestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProblemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "starGuidance" TEXT NOT NULL,
    "sampleOutline" TEXT,
    "companyTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserProblemStatus_userId_status_idx" ON "UserProblemStatus"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserProblemStatus_userId_problemId_key" ON "UserProblemStatus"("userId", "problemId");

-- CreateIndex
CREATE INDEX "HrQuestion_category_idx" ON "HrQuestion"("category");

-- AddForeignKey
ALTER TABLE "UserProblemStatus" ADD CONSTRAINT "UserProblemStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProblemStatus" ADD CONSTRAINT "UserProblemStatus_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
