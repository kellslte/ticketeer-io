import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // The business rules: unit tests alone must cover them. Controllers, repositories and
      // wiring are exercised by the e2e suite instead.
      include: ['src/modules/**/domain/**/*.ts', 'src/modules/**/application/**/*.ts'],
      // DTOs are declarative validation metadata, verified through the e2e suite.
      exclude: ['**/*.spec.ts', '**/*.fakes.ts', '**/*.fixtures.ts', '**/dto/**'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
