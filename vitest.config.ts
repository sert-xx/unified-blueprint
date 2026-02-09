import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
});
