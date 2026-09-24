import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUEUE } from '@/data/mock';
import { makeStore } from '@/test/utils';
import { ROUTES } from './routes';

/** The router is created when the module loads, so each entry URL needs a fresh import. */
async function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  vi.resetModules();
  const { App } = await import('./App');
  return render(
    <Provider store={makeStore()}>
      <App />
    </Provider>,
  );
}

beforeEach(() => vi.resetModules());
afterEach(() => window.history.pushState({}, '', '/'));

describe('App routing', () => {
  it('sends the root URL to the start of the caller flow', async () => {
    await renderAppAt('/');

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
    expect(screen.getByRole('button', { name: /start call/i })).toBeInTheDocument();
  });

  it('sends a bare /caller to the same place', async () => {
    await renderAppAt(ROUTES.caller);
    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
  });

  it('opens the first queued case from /specialist', async () => {
    await renderAppAt(ROUTES.specialist);

    await waitFor(() => expect(window.location.pathname).toBe(`${ROUTES.specialist}/${QUEUE[0].ref}`));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Contested deduction');
  });

  it('sends an unknown URL home', async () => {
    await renderAppAt('/nope/not-a-page');

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.callerReady));
  });

  it('renders the console shell around every screen', async () => {
    await renderAppAt(ROUTES.callerReady);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });
});
