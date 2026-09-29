import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewerSignInModal } from './ReviewerSignInModal';

const setup = (props: Partial<React.ComponentProps<typeof ReviewerSignInModal>> = {}) => {
  const onSubmit = vi.fn();
  render(<ReviewerSignInModal open onSubmit={onSubmit} {...props} />);
  return { onSubmit, user: userEvent.setup() };
};

describe('ReviewerSignInModal', () => {
  it('renders nothing when open is false', () => {
    render(<ReviewerSignInModal open={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the token behind a password input by default', () => {
    setup();
    const input = screen.getByLabelText(/reviewer token/i) as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('toggles token visibility with the eye button', async () => {
    const { user } = setup();
    const input = screen.getByLabelText(/reviewer token/i) as HTMLInputElement;

    await user.click(screen.getByRole('button', { name: /show token/i }));
    expect(input.type).toBe('text');

    await user.click(screen.getByRole('button', { name: /hide token/i }));
    expect(input.type).toBe('password');
  });

  it('submits the trimmed token', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText(/reviewer token/i), '  my-token  ');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('my-token');
  });

  it('disables Sign in when the field is empty (no unauthenticated request)', () => {
    setup();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();
  });

  it('surfaces a sign-in error above the input', () => {
    setup({ error: 'Invalid token.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/invalid token/i);
    expect(screen.getByLabelText(/reviewer token/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the whole form while busy', () => {
    setup({ busy: true });
    expect(screen.getByLabelText(/reviewer token/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /show token/i })).toBeDisabled();
    // Sign in is treated as loading, which also disables it.
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled();
  });
});
