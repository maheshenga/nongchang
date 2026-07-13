import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tarojs/components': resolve(__dirname, 'test/e2e/taro-components.tsx'),
      '@tarojs/taro': resolve(__dirname, 'test/e2e/taro-runtime.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/e2e/**/*.spec.tsx'],
    setupFiles: [resolve(__dirname, 'test/e2e/setup.ts')],
    clearMocks: true,
  },
});
