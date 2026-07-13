import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@tarojs/taro': resolve(__dirname, 'test/taro-mock.ts'),
    },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
  },
});
