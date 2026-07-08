import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TraceabilityPage from './TraceabilityPage';

const traceMocks = vi.hoisted(() => ({
  fetchPublicTrace: vi.fn(),
  TraceNotFoundError: class TraceNotFoundError extends Error {},
}));

vi.mock('../api/trace', () => traceMocks);
vi.mock('./TiandituMap', () => ({ default: () => <div>Origin map</div> }));

const source = () => readFileSync(join(process.cwd(), 'src/components/TraceabilityPage.tsx'), 'utf8');

const publicTrace = {
  code: 'TRACE-1',
  frozen: false,
  scanCount: 7,
  tiandituKey: 'tdt-key',
  batch: {
    batchNo: 'B-TRACE-1',
    cropName: 'Peony',
    plantDate: '2026-06-01T00:00:00.000Z',
    expectedHarvest: '2026-08-01T00:00:00.000Z',
    status: 'growing',
    fieldName: 'Field A',
    fieldLng: 102.1,
    fieldLat: 25.1,
    region: 'Yunnan',
  },
  events: [
    {
      type: 'farm',
      title: 'Planting',
      actor: 'Operator A',
      location: 'Field A',
      occurredAt: '2026-07-01T08:00:00.000Z',
      payload: { desc: 'Seedling record', tag: 'farm-record' },
    },
  ],
  credentials: [
    {
      type: 'certificate',
      title: 'Organic Cert',
      issuer: 'Agency',
      serialNo: 'CERT-1',
      issuedAt: '2026-07-02T00:00:00.000Z',
      fileUrl: 'https://cdn.example.test/cert.pdf',
    },
  ],
};

describe('TraceabilityPage Fluent trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceMocks.fetchPublicTrace.mockResolvedValue(publicTrace);
  });

  it('uses Fluent primitives and excludes legacy marketing and overclaiming copy', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('bg-emerald');
    expect(text).not.toContain('hover:bg-emerald');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('shadow-2xl');
    expect(text).not.toContain('block integrity');
    expect(text).not.toContain('signatures');
    expect(text).not.toContain('正品认证通过');
    expect(text).not.toContain('真实有效');
  });

  it('renders public trace data and credential evidence from the real fetch result', async () => {
    render(<TraceabilityPage code="TRACE-1" />);

    expect(await screen.findByText('Peony')).toBeTruthy();
    expect(traceMocks.fetchPublicTrace).toHaveBeenCalledWith('TRACE-1');
    expect(screen.getByText('B-TRACE-1')).toBeTruthy();
    expect(screen.getByText('Planting')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '凭证' }));
    expect(await screen.findByText('Organic Cert')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Organic Cert/ }).getAttribute('href')).toBe('https://cdn.example.test/cert.pdf');
  });

  it('renders a frozen-code boundary without implying successful authenticity', async () => {
    traceMocks.fetchPublicTrace.mockResolvedValue({ code: 'TRACE-FROZEN', frozen: true });

    render(<TraceabilityPage code="TRACE-FROZEN" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/TRACE-FROZEN/)).toBeTruthy();
  });
});
