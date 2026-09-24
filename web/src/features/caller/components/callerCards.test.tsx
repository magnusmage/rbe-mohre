import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SESSION } from '@/data/mock';
import { setupUser } from '@/test/utils';
import { DraftConfirmCard } from './DraftConfirmCard';
import { FindingsCard } from './FindingsCard';
import { RightsCard } from './RightsCard';
import { SessionStrip } from './SessionStrip';

describe('SessionStrip', () => {
  it('shows the verified session details', () => {
    render(<SessionStrip />);

    expect(screen.getByText(SESSION.workerId)).toBeInTheDocument();
    expect(screen.getByText(SESSION.caseRef)).toBeInTheDocument();
    expect(screen.getByText(SESSION.employer)).toBeInTheDocument();
    expect(screen.getByText(SESSION.contractWage)).toBeInTheDocument();
  });
});

describe('FindingsCard', () => {
  it('separates a verified record from an unverified allegation', () => {
    render(<FindingsCard />);

    expect(screen.getByText('VERIFIED · RECORD')).toBeInTheDocument();
    expect(screen.getByText('ALLEGATION · UNVERIFIED')).toBeInTheDocument();
    expect(screen.getByText(/kept separate from the record/i)).toBeInTheDocument();
    expect(screen.getByText('TIER RAISED · T0 → T2')).toBeInTheDocument();
  });
});

describe('RightsCard', () => {
  it('tells the caller what they can do during the call', () => {
    render(<RightsCard />);

    expect(screen.getByText('human')).toBeInTheDocument();
    expect(screen.getByText('stop')).toBeInTheDocument();
    expect(screen.getByText(/a specialist reviews every case/i)).toBeInTheDocument();
  });
});

describe('DraftConfirmCard', () => {
  it('waits for an explicit yes before drafting', async () => {
    const onConfirm = vi.fn();
    const onDefer = vi.fn();
    const user = setupUser();
    render(<DraftConfirmCard status="pending" onConfirm={onConfirm} onDefer={onDefer} />);

    expect(screen.getByText('pending confirmation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /yes, prepare the draft/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /not yet/i }));
    expect(onDefer).toHaveBeenCalledTimes(1);
  });

  it('locks the choice once the caller has confirmed', () => {
    render(<DraftConfirmCard status="confirmed" onConfirm={vi.fn()} onDefer={vi.fn()} />);

    expect(screen.getByText('worker confirmed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, prepare the draft/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /not yet/i })).toBeDisabled();
  });

  it('shows that the caller deferred', () => {
    render(<DraftConfirmCard status="deferred" onConfirm={vi.fn()} onDefer={vi.fn()} />);
    expect(screen.getByText(/not yet — awaiting worker/i)).toBeInTheDocument();
  });
});
