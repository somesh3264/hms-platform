-- DropForeignKey
ALTER TABLE "bill_line_items" DROP CONSTRAINT "bill_line_items_bill_id_fkey";

-- AlterTable
ALTER TABLE "bill_line_items" ALTER COLUMN "bill_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
