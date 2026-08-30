/*
  Warnings:

  - A unique constraint covering the columns `[collabSlug]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "collabSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_collabSlug_key" ON "public"."Room"("collabSlug");
