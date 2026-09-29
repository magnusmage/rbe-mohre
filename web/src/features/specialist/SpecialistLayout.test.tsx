import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { stubFetch } from '@/test/mocks/browserApis';
import { makeStore, renderWithProviders } from '@/test/utils';
import { SpecialistLayout } from './SpecialistLayout';

const renderLayout = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<SpecialistLayout />, {
    route: ROUTES.specialist,
    path: ROUTES.specialist,
    ...options,
  });

describe('SpecialistLayout — auth gating', () => {
  it('shows the reviewer sign-in modal when no token is present', () => {
    const { calls } = stubFetch({ body: { items: [] } });
    const store = makeStore(undefined, undefined, undefined, { token: null });

    renderLayout({ store });

    expect(screen.getByRole('dialog')).toHaveTextContent(/reviewer sign-in/i);
    // The Review Queue must not mount, and no API request is fired before sign-in.
    expect(screen.queryByRole('search', { name: /search queue/i })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('verifies the token with a live API call before revealing the queue', async () => {
    const { calls } = stubFetch({ body: { items: [] } });
    const store = makeStore(undefined, undefined, undefined, { token: null });

    const { user } = renderLayout({ store });

    await user.type(screen.getByLabelText(/reviewer token/i), 'my-token');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    // The verification request went out with the reviewer bearer.
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer my-token');
    expect(calls[0].url).not.toContain('my-token');

    // Once verification succeeds the modal closes and the queue is revealed.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the modal open on a 401 and surfaces a sign-in error', async () => {
    const { calls } = stubFetch({ status: 401, body: { detail: 'invalid_token' } });
    const store = makeStore(undefined, undefined, undefined, { token: null });

    const { user } = renderLayout({ store });

    await user.type(screen.getByLabelText(/reviewer token/i), 'wrong-token');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i);
    // Modal is still up; the queue never mounted.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Token was cleared so the interceptor stops resending it.
    expect(store.getState().specialistAuth.token).toBeNull();
    // No leaked token in the URL.
    expect(calls[0].url).not.toContain('wrong-token');
  });

  it('reopens the modal when a mid-session request comes back 401', async () => {
    // Layout starts signed in (default fixture) and its queue fetch is refused.
    stubFetch({ status: 401, body: { detail: 'expired' } });

    renderLayout();

    // The 401 response interceptor should have flipped isSignedIn back off and
    // brought the modal up with an explanation, without any user action.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrect|Please try again/i);
  });

  it('mounts the queue immediately when a token was restored from sessionStorage', async () => {
    const { calls } = stubFetch({ body: { items: [] } });
    // Default store fixture is signed in with the test token.
    renderLayout();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
