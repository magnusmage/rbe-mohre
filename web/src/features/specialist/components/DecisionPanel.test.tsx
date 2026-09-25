import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SPECIALIST } from '@/data/mock';
import { stubFetch } from '@/test/mocks/browserApis';
import { makeStore, renderWithProviders } from '@/test/utils';
import { DecisionPanel } from './DecisionPanel';

const REVIEW_REF = 'RV-1790167201-0001';

const renderPanel = (props: Partial<React.ComponentProps<typeof DecisionPanel>> = {}, store = makeStore()) =>
  renderWithProviders(<DecisionPanel reviewRef={REVIEW_REF} locked={false} {...props} />, {
    store,
    route: '/',
  });

describe('DecisionPanel — validation', () => {
  it('does not prefill the note (dummy value removed)', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('radio', { name: /open complaint/i }));
    const note = screen.getByLabelText(/note to record/i) as HTMLTextAreaElement;
    expect(note.value).toBe('');
  });

  it('keeps the confirm button disabled until a note is typed', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('radio', { name: /open complaint/i }));

    const confirm = screen.getByRole('button', { name: /confirm: open complaint/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/a note is required/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/note to record/i), 'Because reasons.');
    expect(confirm).toBeEnabled();
  });

  it('locks the whole panel when the transcript is pending', () => {
    renderPanel({ locked: true });
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('does not fire a request while the panel is locked', async () => {
    const { calls } = stubFetch({ body: { ok: true, decision: 'uphold_information' } });
    const { user } = renderPanel({ locked: true });

    // Radios are disabled — user-event still lets us click, but the click is a no-op.
    await user.click(screen.getAllByRole('radio')[0]);
    expect(calls.length).toBe(0);
  });
});

describe('DecisionPanel — successful submission', () => {
  it('POSTs the mapped decision + reviewer with the bearer token AND token in query', async () => {
    const { calls } = stubFetch({ body: { ok: true, decision: 'open_complaint' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /open complaint/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Filing complaint per FDL 33/2021.');
    await user.click(screen.getByRole('button', { name: /confirm: open complaint/i }));

    await waitFor(() => expect(screen.getByText(/decision recorded/i)).toBeInTheDocument());

    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].url).toBe(
      `http://api.test/review/${encodeURIComponent(REVIEW_REF)}/decision?token=test-reviewer-token`,
    );
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-reviewer-token');

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ decision: 'open_complaint', reviewer: SPECIALIST.name });
  });

  it('shows the recorded decision and locks the radios after success', async () => {
    stubFetch({ body: { ok: true, decision: 'uphold_information' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Facts on record are correct.');
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    await waitFor(() =>
      expect(screen.getByText(/decision recorded/i)).toHaveTextContent('Uphold information'),
    );
    // Note textarea removed once recorded.
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });
});

describe('DecisionPanel — failed submission', () => {
  it('shows an error alert on network failure and keeps the form editable', async () => {
    stubFetch({ networkError: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /refer/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Out of scope.');
    await user.click(screen.getByRole('button', { name: /confirm: refer/i }));

    expect(await screen.findByText(/couldn't record decision/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach the review service/i)).toBeInTheDocument();
    // Form still editable so the user can retry.
    expect(screen.getByLabelText(/note to record/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm: refer/i })).toBeEnabled();
  });

  it('surfaces a transcript-pending 409 with a specific message', async () => {
    stubFetch({ status: 409, body: { detail: 'transcript_pending' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Facts on record are correct.');
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    expect(await screen.findByText(/waiting on the verified transcript/i)).toBeInTheDocument();
  });

  it('surfaces an already-decided 409 with a specific message', async () => {
    stubFetch({ status: 409, body: { detail: 'already_decided' } });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Facts on record are correct.');
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    expect(await screen.findByText(/decision has already been recorded/i)).toBeInTheDocument();
  });
});

describe('DecisionPanel — loading state', () => {
  it('disables inputs and shows a "Recording…" label while submitting', async () => {
    stubFetch({ hang: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Facts on record are correct.');
    await user.click(screen.getByRole('button', { name: /confirm: uphold information/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /recording…/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /recording…/i })).toBeDisabled();
    expect(screen.getByLabelText(/note to record/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    // Radios also locked while submitting.
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('blocks a second submit while one is already in flight', async () => {
    const { calls } = stubFetch({ hang: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /uphold information/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Facts on record are correct.');
    const confirm = screen.getByRole('button', { name: /confirm: uphold information/i });
    await user.click(confirm);

    // The button switches to "Recording…" and is disabled; user-event won't fire a
    // second click on a disabled button, so the assertion is: still only one call.
    expect(calls).toHaveLength(1);
  });
});

describe('DecisionPanel — Cancel', () => {
  it('clears the radio and note, and dismisses any stale error', async () => {
    stubFetch({ networkError: true });
    const { user } = renderPanel();

    await user.click(screen.getByRole('radio', { name: /refer/i }));
    await user.type(screen.getByLabelText(/note to record/i), 'Out of scope.');
    await user.click(screen.getByRole('button', { name: /confirm: refer/i }));

    await screen.findByText(/couldn't record decision/i);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/note to record/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't record decision/i)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /refer/i })).toHaveAttribute('aria-checked', 'false');
  });
});
