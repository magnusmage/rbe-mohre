import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupUser } from '@/test/utils';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card, CardHeader } from './Card';
import { LabeledValue, Orb, SectionLabel, Spinner, TextField, Waveform, Kbd } from './primitives';

describe('Alert', () => {
  it('announces itself with a title and body', () => {
    render(<Alert title="Microphone access needed">Allow access and try again.</Alert>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Microphone access needed');
    expect(alert).toHaveTextContent('Allow access and try again.');
  });

  it('shows a dismiss control only when it can be dismissed', async () => {
    const onDismiss = vi.fn();
    const user = setupUser();
    const { rerender } = render(<Alert title="t">body</Alert>);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();

    rerender(
      <Alert title="t" onDismiss={onDismiss}>
        body
      </Alert>,
    );
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a warning tone differently from an error', () => {
    const { container: error } = render(<Alert title="t">b</Alert>);
    const { container: warning } = render(
      <Alert title="t" tone="warning">
        b
      </Alert>,
    );
    expect(error.firstElementChild?.className).not.toBe(warning.firstElementChild?.className);
  });
});

describe('Button', () => {
  it('is a non-submitting button by default', () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole('button', { name: 'Press' })).toHaveAttribute('type', 'button');
  });

  it('blocks clicks and marks itself busy while loading', async () => {
    const onClick = vi.fn();
    const user = setupUser();
    render(
      <Button loading onClick={onClick}>
        Ending…
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays dimmable when disabled but not loading', () => {
    render(<Button disabled>Press</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button.className).toContain('disabled:opacity-50');
  });

  it('forwards a ref so callers can focus it', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Press</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('Badge', () => {
  it('renders its label and applies the tone', () => {
    render(<Badge tone="danger">TIER 2</Badge>);
    const badge = screen.getByText('TIER 2');
    expect(badge.className).toContain('text-danger');
  });

  it('supports the monospace variant', () => {
    render(
      <Badge tone="success" mono>
        ok
      </Badge>,
    );
    expect(screen.getByText('ok').className).toContain('mono');
  });
});

describe('Card', () => {
  it('renders a header with title, meta and aside content', () => {
    render(
      <Card>
        <CardHeader title="Findings this call" meta={<span>DR-1</span>} aside={<span>2 findings</span>} />
      </Card>,
    );

    expect(screen.getByText('Findings this call')).toBeInTheDocument();
    expect(screen.getByText('DR-1')).toBeInTheDocument();
    expect(screen.getByText('2 findings')).toBeInTheDocument();
  });
});

describe('primitives', () => {
  it('labels a text field for its input', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<TextField label="Worker ID" value="" onChange={onChange} mono />);

    const input = screen.getByLabelText('Worker ID');
    await user.type(input, 'W');
    expect(onChange).toHaveBeenCalled();
    expect(input.className).toContain('font-mono');
  });

  it('renders label/value pairs in both variants', () => {
    const { rerender } = render(<LabeledValue label="Duration" value="04:12" mono />);
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('04:12')).toBeInTheDocument();

    rerender(<LabeledValue label="Language" value="English" variant="plain" />);
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('renders decorative pieces without exposing them to assistive tech', () => {
    const { container } = render(
      <div>
        <Orb state="live">
          <Waveform />
        </Orb>
        <Spinner />
        <SectionLabel>Call summary</SectionLabel>
        <Kbd>human</Kbd>
      </div>,
    );

    expect(container.querySelector('.orb')?.className).toContain('orb-live');
    expect(container.querySelectorAll('.wave i')).toHaveLength(7);
    expect(screen.getByText('Call summary')).toBeInTheDocument();
    expect(screen.getByText('human').className).toBe('kbd');
  });

  it('pauses the waveform when asked', () => {
    const { container } = render(<Waveform paused />);
    expect(container.querySelector('.wave')?.className).toContain('wave-paused');
  });

  it('shows the ended orb state', () => {
    const { container } = render(<Orb state="ended" size="med" />);
    const orb = container.querySelector('.orb');
    expect(orb?.className).toContain('orb-ended');
    expect(orb?.className).toContain('orb-idle');
  });
});
