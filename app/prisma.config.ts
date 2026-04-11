// Prisma v7 config.
// directUrl bypasses the Neon connection pooler for migrations/introspection
// (Neon's pooler doesn't support the transaction protocol needed for migrations).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
