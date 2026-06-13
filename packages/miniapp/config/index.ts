import { defineConfig } from '@tarojs/cli';
import devConfig from './dev';
import prodConfig from './prod';

export default defineConfig(async (merge, { mode }) => {
  const baseConfig = {
    projectName: 'miniapp',
    date: '2026-6-13',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {},
    framework: 'react',
    compiler: 'webpack5',
    cache: { enable: false },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
  };
  if (mode === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
