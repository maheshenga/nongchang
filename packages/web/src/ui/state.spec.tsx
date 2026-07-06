import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, LoadingState } from './state';

describe('shared data states', () => {
  it('renders an accessible loading state with a custom label', () => {
    render(<LoadingState label="Loading tenants" />);
    expect(screen.getByRole('status', { name: 'Loading tenants' })).toBeTruthy();
  });

  it('renders an accessible empty state with optional description', () => {
    render(<EmptyState title="No accounts" description="Create one first." />);
    expect(screen.getByRole('status', { name: 'No accounts' })).toBeTruthy();
    expect(screen.getByText('Create one first.')).toBeTruthy();
  });

  it('renders an accessible error state and calls retry', () => {
    const retry = vi.fn();
    render(<ErrorState message="Network failed" onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Network failed');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
