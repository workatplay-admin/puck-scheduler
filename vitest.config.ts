import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Components are tested (jsdom + @testing-library landed in v0.6) but stay out of
        // the coverage report: it would pull in every generated shadcn primitive in
        // src/components/ui/ and drown the signal.
        'src/components/**',
        'src/pages/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/App.css',
        'src/index.css',
        'src/vite-env.d.ts',
        'src/**/__tests__/**',
        'src/**/__fixtures__/**',
        'src/**/*.d.ts',
        // Worker is exercised via the integration path but vitest cannot
        // import the Vite ?worker target directly under the node env.
        'src/scheduler/worker.ts',
      ],
      thresholds: {
        // Aggregate thresholds for the pipeline and parser modules.
        'src/scheduler/**/*.ts': { lines: 80, branches: 70 },
        'src/parsers/**/*.ts': { lines: 80, branches: 80 },
        // Hook coverage became measurable in v0.6 when jsdom + @testing-library/react
        // landed. Set at the level the suite currently reaches, as a ratchet.
        'src/hooks/useSchedulerStore.ts': { lines: 70, branches: 85 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
