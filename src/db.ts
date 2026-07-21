import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
  ssl: {
    rejectUnauthorized: false // Required for Neon secure serverless DB connection
  }
});

const adapter = new PrismaPg(pool);
const prismaRaw = new PrismaClient({ adapter });
const slowQueryThresholdMs = Number(process.env.PRISMA_SLOW_QUERY_MS || 120);

export const prisma = prismaRaw.$extends({
  query: {
    $allOperations({ model, operation, args, query }) {
      const start = performance.now();
      return query(args).finally(() => {
        const duration = performance.now() - start;
        if (duration >= slowQueryThresholdMs) {
          console.warn(`[PRISMA SLOW QUERY] ${model || "Raw"}.${operation} executed in ${duration.toFixed(2)}ms`);
        }
      });
    }
  }
});
