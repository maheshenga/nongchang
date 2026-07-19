import { useCallback, useState } from 'react';
import type { Layout } from 'react-grid-layout';

type DemoLayouts = Partial<Record<string, Layout>>;

const DEFAULT_LAYOUT: Layout = [
  { i: 'kpis', x: 0, y: 0, w: 12, h: 4 },
  { i: 'charts', x: 0, y: 4, w: 12, h: 10 },
  { i: 'map', x: 0, y: 14, w: 6, h: 8 },
  { i: 'operations', x: 6, y: 14, w: 6, h: 8 },
];

export function useDashboardDemoLayout() {
  const [layouts, setLayouts] = useState<DemoLayouts>({ lg: DEFAULT_LAYOUT });
  const [presentationMode, setPresentationMode] = useState(false);

  const togglePresentationMode = useCallback((active: boolean) => {
    setPresentationMode(active);
    window.dispatchEvent(new CustomEvent('toggle-presentation', { detail: { mode: active } }));
  }, []);

  return {
    layouts,
    presentationMode,
    togglePresentationMode,
    onLayoutChange: (_current: Layout, next: DemoLayouts) => setLayouts(next),
    resetLayout: () => setLayouts({ lg: DEFAULT_LAYOUT }),
  };
}
