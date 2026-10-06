import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // The required test exercises the API layer only: Node + msw/node, no DOM needed.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
