-- CreateTable
CREATE TABLE "CompanyQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT,
    "question" TEXT NOT NULL,
    "answerHint" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyQuestion_companyId_category_idx" ON "CompanyQuestion"("companyId", "category");

-- AddForeignKey
ALTER TABLE "CompanyQuestion" ADD CONSTRAINT "CompanyQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
