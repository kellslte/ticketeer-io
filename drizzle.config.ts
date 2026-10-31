import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/modules/**/infrastructure/*.table.ts', './src/shared/infrastructure/*.table.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
