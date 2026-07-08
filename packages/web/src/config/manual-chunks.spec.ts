import { describe, expect, it } from 'vitest';
import { dashboardDemoManualChunk } from './manual-chunks';

describe('dashboardDemoManualChunk', () => {
  it('splits demo chart packages into a chart vendor chunk', () => {
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/recharts/es6/chart/AreaChart.js')).toBe(
      'dashboard-demo-charts',
    );
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/d3-scale/src/index.js')).toBe(
      'dashboard-demo-charts',
    );
  });

  it('splits demo grid and animation packages into focused chunks', () => {
    expect(
      dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react-grid-layout/build/ResponsiveReactGridLayout.js'),
    ).toBe('dashboard-demo-layout');
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react-resizable/build/Resizable.js')).toBe(
      'dashboard-demo-layout',
    );
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/motion/dist/es/index.mjs')).toBe(
      'dashboard-demo-motion',
    );
  });

  it('leaves shared app dependencies in Vite default chunks', () => {
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/src/components/DashboardDemo.tsx')).toBeUndefined();
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react/index.js')).toBeUndefined();
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/lucide-react/dist/esm/icons/mail.js')).toBeUndefined();
  });
});
