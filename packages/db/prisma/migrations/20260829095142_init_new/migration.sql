/*
  Warnings:

  - A unique constraint covering the columns `[viewSlug]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "viewSlug" TEXT;

-- CreateTable
CREATE TABLE "public"."_RoomEditors" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RoomEditors_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RoomEditors_B_index" ON "public"."_RoomEditors"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Room_viewSlug_key" ON "public"."Room"("viewSlug");

-- AddForeignKey
ALTER TABLE "public"."_RoomEditors" ADD CONSTRAINT "_RoomEditors_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_RoomEditors" ADD CONSTRAINT "_RoomEditors_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
