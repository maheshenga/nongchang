import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // e2e 用例共享同一真实数据库与种子账户,部分用例会破坏性改写共享余额
    // (如计费硬熔断需把商户 CODE 余额压到 2)。串行执行避免跨文件竞态误报。
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
