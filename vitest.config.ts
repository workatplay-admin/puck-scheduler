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
        // src/hooks/useSchedulerStore.ts threshold is parked until React
        // hook test infrastructure (jsdom + @testing-library/react) lands.
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
