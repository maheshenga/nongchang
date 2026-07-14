export function dashboardDemoManualChunk(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');
  if (!normalized.includes('/node_modules/')) return undefined;

  if (normalized.includes('/recharts/') || /\/node_modules\/d3-[^/]+\//.test(normalized)) {
    return 'dashboard-demo-charts';
  }

  if (normalized.includes('/react-grid-layout/') || normalized.includes('/react-resizable/')) {
    return 'dashboard-demo-layout';
  }

  if (normalized.includes('/motion/')) {
    return 'dashboard-demo-motion';
  }

  return undefined;
}

export function manualChunksForBuild(
  demoDashboardEnabled: boolean,
): typeof dashboardDemoManualChunk | undefined {
  return demoDashboardEnabled ? dashboardDemoManualChunk : undefined;
}
