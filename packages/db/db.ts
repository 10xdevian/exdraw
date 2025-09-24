import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  return new PrismaClient();
};

// Declare Global Variable (only in dev)
declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Initialize Prisma Client (using global if it exists)
const prisma: ReturnType<typeof prismaClientSingleton> =
  globalThis.prismaGlobal ?? prismaClientSingleton();

// Store in Global (in Development only)
if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

// 6. Connect to the Database and Log Result

prisma
  .$connect()
  .then(() => {
    console.log("✅ Database connected successfully.");
  })
  .catch((err: any) => {
    console.error("❌ Failed to connect to the database:", err);
  });

export default prisma
