import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'tests/**/*.test.ts',
      'research/**/*.test.ts',
    ],
    exclude: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
});
