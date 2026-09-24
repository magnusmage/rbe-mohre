import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupUser } from '@/test/utils';
import { ConfirmDialog } from './ConfirmDialog';

const props = {
  open: true,
  title: 'Leave this call?',
  message: 'Are you sure you want to leave? The call will end.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<ConfirmDialog {...props} open={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the question as an accessible modal', () => {
    render(<ConfirmDialog {...props} />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Leave this call?' })).toBeInTheDocument();
    expect(screen.getByText(props.message)).toBeInTheDocument();
  });

  it('focuses the confirm button so Enter confirms', () => {
    render(<ConfirmDialog {...props} confirmLabel="Yes, end the call" />);
    expect(screen.getByRole('button', { name: 'Yes, end the call' })).toHaveFocus();
  });

  it('reports confirm and cancel presses', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = setupUser();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', async () => {
    const onCancel = vi.fn();
    const user = setupUser();
    render(<ConfirmDialog {...props} onCancel={onCancel} />);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when the overlay is clicked but not the panel', async () => {
    const onCancel = vi.fn();
    const user = setupUser();
    const { container } = render(<ConfirmDialog {...props} onCancel={onCancel} />);

    await user.click(screen.getByRole('alertdialog'));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(container.firstElementChild as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks every dismissal while the confirmed action is running', async () => {
    const onCancel = vi.fn();
    const user = setupUser();
    const { container } = render(<ConfirmDialog {...props} busy onCancel={onCancel} />);

    await user.keyboard('{Escape}');
    await user.click(container.firstElementChild as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-busy', 'true');
  });

  it('stops listening for Escape once closed', async () => {
    const onCancel = vi.fn();
    const user = setupUser();
    const { rerender } = render(<ConfirmDialog {...props} onCancel={onCancel} />);

    rerender(<ConfirmDialog {...props} open={false} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
