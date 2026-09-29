import { renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { useLanguage } from '@/context/LanguageContext';
import { selectIsReviewerSignedIn } from '@/features/specialist/state/specialistAuthSlice';
import { makeStore, renderWithProviders, type TestStore } from '@/test/utils';
import { TopBar } from './TopBar';

const renderTopBar = (route: string = ROUTES.callerReady, store?: TestStore) =>
  renderWithProviders(<TopBar />, {
    route,
    store,
    extraRoutes: [
      { path: ROUTES.callerReady, element: <TopBar /> },
      { path: `${ROUTES.specialist}/:caseRef`, element: <TopBar /> },
    ],
  });

describe('TopBar', () => {
  it('links the logo to the start of the caller flow', () => {
    renderTopBar();
    expect(screen.getByRole('link', { name: /rbe home/i })).toHaveAttribute('href', ROUTES.callerReady);
  });

  it('offers both areas of the console', () => {
    renderTopBar();
    expect(screen.getByRole('link', { name: 'Caller' })).toHaveAttribute('href', ROUTES.caller);
    expect(screen.getByRole('link', { name: 'Specialist review' })).toHaveAttribute('href', ROUTES.specialist);
  });

  it('hides the specialist identity on caller screens', () => {
    renderTopBar();
    expect(screen.queryByText('Case Reviewer')).not.toBeInTheDocument();
  });

  it('shows the specialist identity on review screens', () => {
    renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    expect(screen.getByText('Case Reviewer')).toBeInTheDocument();
    expect(screen.getByText(/tier 2 cleared/i)).toBeInTheDocument();
  });

  it('exposes a reviewer menu trigger with the identity on specialist screens', () => {
    renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    const trigger = screen.getByRole('button', { name: /reviewer menu/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // The Sign out action lives inside the menu, not on the top bar directly.
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('opens a menu with Sign out inside when the reviewer chip is clicked', async () => {
    const { user } = renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    const trigger = screen.getByRole('button', { name: /reviewer menu/i });

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: /reviewer menu/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('closes the reviewer menu on Escape', async () => {
    const { user } = renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    await user.click(screen.getByRole('button', { name: /reviewer menu/i }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: /reviewer menu/i })).not.toBeInTheDocument();
  });

  it('closes the reviewer menu when clicking elsewhere', async () => {
    const { user } = renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    await user.click(screen.getByRole('button', { name: /reviewer menu/i }));

    await user.click(document.body);

    expect(screen.queryByRole('menu', { name: /reviewer menu/i })).not.toBeInTheDocument();
  });

  it('does not render the reviewer menu on caller screens', () => {
    renderTopBar();
    expect(screen.queryByRole('button', { name: /reviewer menu/i })).not.toBeInTheDocument();
  });

  it('renders the identity as an inert chip when signed out on specialist screens', () => {
    const store = makeStore(undefined, undefined, undefined, { token: null });
    renderTopBar(`${ROUTES.specialist}/RV-2409-0031`, store);
    // The chip's text is still visible for context, but there is no trigger and
    // therefore no Sign-out menu item to invoke.
    expect(screen.getByText('Case Reviewer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reviewer menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('clears the reviewer token from Redux when Sign out is picked from the menu', async () => {
    const store = makeStore();
    expect(selectIsReviewerSignedIn(store.getState())).toBe(true);

    const { user } = renderTopBar(`${ROUTES.specialist}/RV-2409-0031`, store);
    await user.click(screen.getByRole('button', { name: /reviewer menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));

    expect(selectIsReviewerSignedIn(store.getState())).toBe(false);
    expect(window.sessionStorage.getItem('rbe:specialist:reviewer-token')).toBeNull();
    // Menu closes as part of the action so it doesn't linger over the sign-in modal.
    expect(screen.queryByRole('menu', { name: /reviewer menu/i })).not.toBeInTheDocument();
  });
});

describe('LanguageMenu', () => {
  it('opens, switches language and closes', async () => {
    const { user } = renderTopBar();

    const trigger = screen.getByRole('button', { expanded: false });
    await user.click(trigger);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(screen.getByRole('option', { name: /english/i })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: /arabic/i }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Arabic');
  });

  it('closes on Escape without changing the language', async () => {
    const { user } = renderTopBar();
    const trigger = screen.getByRole('button', { expanded: false });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('English');
  });

  it('closes when the caller clicks elsewhere', async () => {
    const { user } = renderTopBar();

    await user.click(screen.getByRole('button', { expanded: false }));
    await user.click(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('useLanguage', () => {
  it('refuses to run outside its provider', () => {
    expect(() => renderHook(() => useLanguage())).toThrow(/LanguageProvider/);
  });
});
