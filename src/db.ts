import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon secure serverless DB connection
  }
});

const adapter = new PrismaPg(pool);
const prismaRaw = new PrismaClient({ adapter });

export const prisma = prismaRaw.$extends({
  query: {
    $allOperations({ model, operation, args, query }) {
      const start = performance.now();
      return query(args).finally(() => {
        const duration = performance.now() - start;
        console.log(`[PRISMA DB CALL] ${model || "Raw"}.${operation} executed in ${duration.toFixed(2)}ms`);
      });
    }
  }
});
