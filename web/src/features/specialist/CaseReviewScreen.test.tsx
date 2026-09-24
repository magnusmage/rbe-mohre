import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/app/routes';
import { AUDIT, CASES, SPECIALIST } from '@/data/mock';
import { renderWithProviders } from '@/test/utils';
import { CaseReviewScreen } from './CaseReviewScreen';

const CASE_REF = 'RV-2409-0031';

const renderCase = (ref = CASE_REF) =>
  renderWithProviders(<CaseReviewScreen />, {
    route: `${ROUTES.specialist}/${ref}`,
    path: `${ROUTES.specialist}/:caseRef`,
  });

describe('CaseReviewScreen — case pack', () => {
  it('heads the review with the case, tier and worker', () => {
    renderCase();
    const detail = CASES[CASE_REF];

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(detail.title);
    expect(screen.getByText('TIER 2 · MANDATORY QUALIFIED')).toBeInTheDocument();
    expect(screen.getByText(/Al-Warda Facilities LLC/)).toBeInTheDocument();
  });

  it('keeps verified records and caller allegations apart', () => {
    renderCase();

    expect(screen.getByText('Verified facts (records)')).toBeInTheDocument();
    expect(screen.getByText('Allegations (caller, unverified)')).toBeInTheDocument();
    expect(screen.getByText(/kept separate by design/i)).toBeInTheDocument();
  });

  it('shows the worker-confirmed draft as not yet filed', () => {
    renderCase();

    expect(screen.getByText('Complaint draft (worker-confirmed)')).toBeInTheDocument();
    expect(screen.getByText(/DR-2409-0087 · filed: false/)).toBeInTheDocument();
  });

  it('lists every tool call in the agent activity log', () => {
    renderCase();

    expect(screen.getByText('Agent activity (append-only)')).toBeInTheDocument();
    // The only list in the main column is the activity log; the transcript lives in the aside.
    const rows = within(screen.getByRole('main')).getAllByRole('listitem');
    expect(rows).toHaveLength(AUDIT.length);
    expect(within(rows[1]).getByText('check_wage')).toBeInTheDocument();
    expect(within(rows[1]).getByText('discrepancy')).toBeInTheDocument();
  });

  it('says the decision is ready once the transcript is stored', () => {
    renderCase();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Ready to decide.');
    expect(banner).toHaveTextContent(CASES[CASE_REF].transcriptStoredAt);
  });

  it('offers a printable pack', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const { user } = renderCase();

    await user.click(screen.getByRole('button', { name: /print pack/i }));
    expect(print).toHaveBeenCalled();
  });

  it('explains when a queued case has no pack loaded', () => {
    renderCase('RV-2409-0030');

    expect(screen.getByText('Case pack not available')).toBeInTheDocument();
    expect(screen.queryByText('Specialist decision')).not.toBeInTheDocument();
  });
});

describe('CaseReviewScreen — evidence panel', () => {
  it('starts on the transcript and shows the case history', () => {
    renderCase();

    expect(screen.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Case history')).toBeInTheDocument();
    expect(screen.getByText(/Draft confirmed by worker/)).toBeInTheDocument();
  });

  it('switches to the audit log and the rule text', async () => {
    const { user } = renderCase();

    await user.click(screen.getByRole('tab', { name: 'Audit log' }));
    expect(screen.getByText('Agent activity · append-only')).toBeInTheDocument();
    expect(screen.queryByText('Case history')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Rule text' }));
    // The same rule is also summarised in the verified facts card, so scope to the panel.
    const panel = within(screen.getByRole('tabpanel'));
    expect(panel.getByText(/Rule in force · 340\/2026/)).toBeInTheDocument();
    expect(panel.getByText(/salary due 1st of following month/i)).toBeInTheDocument();
  });
});

describe('CaseReviewScreen — decision', () => {
  it('asks for a note only once an outcome is chosen', async () => {
    const { user } = renderCase();
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /open complaint/i }));

    expect(screen.getByLabelText(/note to record/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm: open complaint/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SPECIALIST.name))).toBeInTheDocument();
  });

  it('lets the specialist change their mind before confirming', async () => {
    const { user } = renderCase();

    await user.click(screen.getByRole('radio', { name: /refer/i }));
    expect(screen.getByRole('radio', { name: /refer/i })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /refer/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('refuses to confirm without a note', async () => {
    const { user } = renderCase();
    await user.click(screen.getByRole('radio', { name: /uphold information/i }));

    await user.clear(screen.getByLabelText(/note to record/i));

    expect(screen.getByRole('button', { name: /confirm: uphold information/i })).toBeDisabled();
  });

  it('records the decision once and then locks the panel', async () => {
    const { user } = renderCase();
    await user.click(screen.getByRole('radio', { name: /open complaint/i }));

    await user.click(screen.getByRole('button', { name: /confirm: open complaint/i }));

    // Two live regions now: the transcript banner and the recorded decision.
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText(/decision recorded/i)).toHaveTextContent('Open complaint');
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();
    screen.getAllByRole('radio').forEach((option) => expect(option).toBeDisabled());
  });
});
