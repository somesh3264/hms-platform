-- DropForeignKey
ALTER TABLE "bills" DROP CONSTRAINT "bills_visit_id_fkey";

-- AlterTable
ALTER TABLE "bills" ALTER COLUMN "visit_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
