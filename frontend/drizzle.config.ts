import type { Config } from 'drizzle-kit';

// Optional: `npx drizzle-kit generate` can diff src/db/schema.ts. The app itself applies
// the SQL in src/db/migrations.ts at startup (see README, "DB schema").
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
