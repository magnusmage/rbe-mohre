import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { makeStore, renderWithProviders } from '@/test/utils';
import type { CallSessionState } from '../state/callSessionSlice';
import { CallEndedScreen } from './CallEndedScreen';

const renderEnded = (state: Partial<CallSessionState> = {}) =>
  renderWithProviders(<CallEndedScreen />, {
    store: makeStore(state),
    route: ROUTES.callerEnded,
    extraRoutes: [{ path: ROUTES.callerReady, element: <div>start call screen</div> }],
  });

describe('CallEndedScreen', () => {
  it('shows the duration of the call that just finished', () => {
    renderEnded({ status: 'ended', durationSeconds: 125 });

    expect(screen.getByText(/call ended/i)).toHaveTextContent('02:05');
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('02:05');
  });

  it('formats a long call with hours', () => {
    renderEnded({ status: 'ended', durationSeconds: 3725 });
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('1:02:05');
  });

  it('falls back to the sample duration when opened without a finished call', () => {
    renderEnded();
    expect(screen.getByText('Duration').nextElementSibling).toHaveTextContent('04:12');
  });

  it('shows the review reference and lets the caller copy it', async () => {
    const { user } = renderEnded({ status: 'ended', durationSeconds: 10 });

    expect(screen.getByText('RV-2409-0031')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    // user-event supplies the clipboard in jsdom; read back what the page wrote.
    await expect(navigator.clipboard.readText()).resolves.toBe('RV-2409-0031');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('explains what happens next', () => {
    renderEnded();

    expect(screen.getByText('Transcript stored')).toBeInTheDocument();
    expect(screen.getByText('Specialist reviews')).toBeInTheDocument();
    expect(screen.getByText("You'll hear back")).toBeInTheDocument();
  });

  it('goes back to Start call rather than the finished call', async () => {
    const { user, location } = renderEnded({ status: 'ended', durationSeconds: 10 });

    await user.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
  });

  it('offers a new call', async () => {
    const { user, location } = renderEnded({ status: 'ended', durationSeconds: 10 });

    await user.click(screen.getByRole('button', { name: 'New call' }));

    await waitFor(() => expect(location()).toBe(ROUTES.callerReady));
  });
});
