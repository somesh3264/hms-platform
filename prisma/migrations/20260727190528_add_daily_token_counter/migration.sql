-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "token_number" INTEGER;

-- CreateTable
CREATE TABLE "daily_token_counters" (
    "hospital_id" TEXT NOT NULL,
    "token_date" DATE NOT NULL,
    "last_token" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_token_counters_pkey" PRIMARY KEY ("hospital_id","token_date")
);

-- AddForeignKey
ALTER TABLE "daily_token_counters" ADD CONSTRAINT "daily_token_counters_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
