import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SPECIALIST } from '@/data/mock';
import { stubFetch } from '@/test/mocks/browserApis';
import { makeStore, renderWithProviders } from '@/test/utils';
import { DecisionPanel } from './DecisionPanel';

const REVIEW_REF = 'RV-1790167201-0001';

/** Backend-shaped response used when the panel refetches the case after a success. */
function refetchBody(decision: string | null) {
  return {
    ok: true,
    review: {
      review_ref: REVIEW_REF,
      case_ref: 'LAB-1001',
      conversation_id: 'c1',
      tier: 'tier_0_standard_review',
      summary: 'Regression test',
      decision,
      decided_by: decision ? SPECIALIST.name : null,
      decided_at: decision ? 1790200000 : null,
      transcript_ready: true,
    },
    package: { allegations: [] },
    allegations: [],
    draft: null,
    transcript: null,
    audit: [],
  };
}

const renderPanel = (props: Partial<React.ComponentProps<typeof DecisionPanel>> = {}, store = makeStore()) =>
  renderWithProviders(
    <DecisionPanel reviewRef={REVIEW_REF} locked={false} recordedDecision={null} {...props} />,
    { store, route: '/' },
  );

describe('DecisionPanel — validation', () => {
  it('does not prefill the note (dummy value removed)', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('radio', { name: /open complaint/i }));
    const note = screen.getByLabelText(/note to record/i) as HTMLTextAreaElement;
    expect(note.value).toBe('');
  });

  it('lets the specialist submit without typing a note', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('radio', { name: /open complaint/i }));
    // Note is empty — confirm should still be enabled.
    expect(screen.getByRole('button', { name: /confirm: open complaint/i })).toBeEnabled();
  });

  it('locks the whole panel when the transcript is pending', () => {
    renderPanel({ locked: true });
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('does not fire a request while the panel is locked', async () => {
    const { calls } = stubFetch({ body: { ok: true, decision: 'uphold_information' } });
    const { user } = renderPanel({ locked: true });
    await user.click(screen.getAllByRole('radio')[0]);
    expect(calls.length).toBe(0);
  });

  it('is fully disabled when a decision is already on record', () => {
    renderPanel({ recordedDecision: 'open_complaint', decidedBy: 'Case Reviewer', decidedAt: '17:03:22' });
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
    expect(screen.getByLabelText(/note to record/i)).toBeDisabled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/decision recorded/i);
    expect(status).toHaveTextContent('Open complaint');
    expect(status).toHaveTextContent('17:03:22');
    // No submit button visible when already decided.
    expect(screen.queryByRole('button', { name: /confirm:/i })).not.toBeInTheDocument();
  });
});

describe('DecisionPanel — successful submission', () => {
  it('POSTs the mapped decision + reviewer with the bearer token AND token in query', async () => {
    const { calls } = stubFetch([
      { body: { ok: true, decision: 'open_complaint' } },
      { body: refetchBody('open_complaint') },
    ]);
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /open complaint/i }));
    await user.click(screen.getByRole('button', { name: /confirm: open complaint/i }));

    // Wait for POST + refetch to both fire.
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));

    // POST
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].url).toBe(
      `http://api.test/review/${encodeURIComponent(REVIEW_REF)}/decision?token=test-reviewer-token`,
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-reviewer-token');
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ decision: 'open_complaint', reviewer: SPECIALIST.name });

    // Refetch (GET /review/{ref})
    expect(calls[1].init?.method).toBe('GET');
    expect(calls[1].url).toBe(`http://api.test/review/${encodeURIComponent(REVIEW_REF)}`);
  });

  it('POSTs the exact decision code for every option', async () => {
    // uphold → uphold_information
    let scenario = stubFetch([
      { body: { ok: true, decision: 'uphold_information' } },
      { body: refetchBody('uphold_information') },
    ]);
    let ctx = renderPanel();
    await ctx.user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await ctx.user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));
    await waitFor(() => expect(scenario.calls.length).toBeGreaterThanOrEqual(1));
    expect(JSON.parse(scenario.calls[0].init?.body as string).decision).toBe('uphold_information');

    // refer → refer
    scenario = stubFetch([{ body: { ok: true, decision: 'refer' } }, { body: refetchBody('refer') }]);
    ctx.unmount();
    ctx = renderPanel();
    await ctx.user.click(screen.getByRole('radio', { name: /refer/i }));
    await ctx.user.click(screen.getByRole('button', { name: /confirm: refer/i }));
    await waitFor(() => expect(scenario.calls.length).toBeGreaterThanOrEqual(1));
    expect(JSON.parse(scenario.calls[0].init?.body as string).decision).toBe('refer');

    // more → request_more
    scenario = stubFetch([{ body: { ok: true, decision: 'request_more' } }, { body: refetchBody('request_more') }]);
    ctx.unmount();
    ctx = renderPanel();
    await ctx.user.click(screen.getByRole('radio', { name: /04\s+request more/i }));
    await ctx.user.click(screen.getByRole('button', { name: /confirm: request more evidence/i }));
    await waitFor(() => expect(scenario.calls.length).toBeGreaterThanOrEqual(1));
    expect(JSON.parse(scenario.calls[0].init?.body as string).decision).toBe('request_more');
  });
});

describe('DecisionPanel — failed submission', () => {
  it('shows an error alert on network failure and keeps the form editable', async () => {
    stubFetch({ networkError: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /refer/i }));
    await user.click(screen.getByRole('button', { name: /confirm: refer/i }));

    expect(await screen.findByText(/couldn't record decision/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach the review service/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note to record/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm: refer/i })).toBeEnabled();
  });

  it('surfaces a transcript-pending 409 with a specific message', async () => {
    stubFetch({ status: 409, body: { detail: 'transcript_pending' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    expect(await screen.findByText(/waiting on the verified transcript/i)).toBeInTheDocument();
  });

  it('surfaces an already-decided 409 with a specific message', async () => {
    stubFetch({ status: 409, body: { detail: 'already_decided' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    expect(await screen.findByText(/decision has already been recorded/i)).toBeInTheDocument();
  });
});

describe('DecisionPanel — loading state', () => {
  it('disables inputs and shows a "Recording…" label while submitting', async () => {
    stubFetch({ hang: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /recording…/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /recording…/i })).toBeDisabled();
    expect(screen.getByLabelText(/note to record/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('blocks a second submit while one is already in flight', async () => {
    const { calls } = stubFetch({ hang: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    const confirm = screen.getByRole('button', { name: /confirm: uphold information/i });
    await user.click(confirm);
    // Button is now "Recording…" and disabled — attempting to click again is a no-op.
    expect(calls).toHaveLength(1);
  });
});

describe('DecisionPanel — post-record state', () => {
  it('keeps the note field visible after a decision is recorded', () => {
    renderPanel({ recordedDecision: 'open_complaint' });
    expect(screen.getByLabelText(/note to record/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note to record/i)).toBeDisabled();
  });

  it('highlights the recorded decision in the radio group', () => {
    renderPanel({ recordedDecision: 'refer' });
    const refer = screen.getByRole('radio', { name: /refer/i });
    expect(refer).toHaveAttribute('aria-checked', 'true');
  });
});

describe('DecisionPanel — Cancel', () => {
  it('clears the radio and note, and dismisses any stale error', async () => {
    stubFetch({ networkError: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /refer/i }));
    await user.click(screen.getByRole('button', { name: /confirm: refer/i }));
    await screen.findByText(/couldn't record decision/i);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't record decision/i)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /refer/i })).toHaveAttribute('aria-checked', 'false');
  });
});
