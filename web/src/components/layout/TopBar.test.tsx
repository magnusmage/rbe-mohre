import { renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { useLanguage } from '@/context/LanguageContext';
import { renderWithProviders } from '@/test/utils';
import { TopBar } from './TopBar';

const renderTopBar = (route: string = ROUTES.callerReady) =>
  renderWithProviders(<TopBar />, {
    route,
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
    expect(screen.queryByText('Fatima Al Marri')).not.toBeInTheDocument();
  });

  it('shows the specialist identity on review screens', () => {
    renderTopBar(`${ROUTES.specialist}/RV-2409-0031`);
    expect(screen.getByText('Fatima Al Marri')).toBeInTheDocument();
    expect(screen.getByText(/tier 2 cleared/i)).toBeInTheDocument();
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
