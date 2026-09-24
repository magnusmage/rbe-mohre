import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TranscriptEntry } from '@/types';
import { TranscriptList, TranscriptPanel } from './Transcript';

const ENTRIES: TranscriptEntry[] = [
  { who: 'Agent', time: '00:04', text: 'This call is recorded.' },
  { who: 'Worker', time: '00:41', text: 'My July pay was short.' },
  { who: 'Agent', time: '03:12', tool: 'check_wage', text: 'WPS shows AED 3,500.00.' },
];

describe('TranscriptList', () => {
  it('lists every turn with its speaker and timestamp', () => {
    render(<TranscriptList entries={ENTRIES} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Agent')).toBeInTheDocument();
    expect(within(items[0]).getByText('00:04')).toBeInTheDocument();
    expect(within(items[1]).getByText('My July pay was short.')).toBeInTheDocument();
  });

  it('hides tool chips unless asked for', () => {
    const { rerender } = render(<TranscriptList entries={ENTRIES} />);
    expect(screen.queryByText('check_wage')).not.toBeInTheDocument();

    rerender(<TranscriptList entries={ENTRIES} showTools />);
    expect(screen.getByText('check_wage')).toBeInTheDocument();
  });

  it('renders nothing but an empty list when there are no turns', () => {
    render(<TranscriptList entries={[]} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('supports a compact density for the side panel', () => {
    const { container } = render(<TranscriptList entries={ENTRIES} density="compact" />);
    expect(container.querySelector('li div')?.className).toContain('gap-1.5');
  });
});

describe('TranscriptPanel', () => {
  it('shows a title and extra header content around the turns', () => {
    render(<TranscriptPanel title="Live transcript" aside={<span>Scribe v2</span>} entries={ENTRIES} showTools />);

    expect(screen.getByText('Live transcript')).toBeInTheDocument();
    expect(screen.getByText('Scribe v2')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
