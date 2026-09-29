import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { EyeIcon, EyeOffIcon, LockIcon } from '@/components/icons';
import { Alert, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

interface ReviewerSignInModalProps {
  open: boolean;
  /** Called with the trimmed token when the reviewer submits the form. */
  onSubmit: (token: string) => void;
  /** Optional error to display above the input (e.g. after a 401 rejection). */
  error?: string | null;
  /** Disables the form while a sign-in-triggered request is in flight. */
  busy?: boolean;
}

/**
 * Blocks the Specialist area until a reviewer signs in. The token is only ever
 * kept in Redux + sessionStorage — this component never logs it and never
 * mirrors it into a module-level variable.
 *
 * Password-typed input keeps the token hidden by default; an eye toggle lets
 * the reviewer reveal it briefly to check what they typed. There is no
 * "remember" option: the token clears when the tab closes, so a shared
 * workstation cannot be picked up mid-shift by someone else.
 */
export function ReviewerSignInModal({ open, onSubmit, error = null, busy = false }: ReviewerSignInModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clear the field when the modal closes, so a stale token can't sit in the
  // DOM waiting for the next open.
  useEffect(() => {
    if (!open) {
      setValue('');
      setRevealed(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[440px] rounded-xl border border-line bg-white p-6 shadow-[0_24px_60px_-20px_rgba(20,32,43,.45)]"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-brand-25 text-brand">
            <LockIcon size={18} />
          </div>
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold">
              Reviewer sign-in
            </h2>
            <p id={descriptionId} className="text-[12.5px] text-muted">
              Enter your reviewer token to access review cases.
            </p>
          </div>
        </div>

        {error && (
          <div id={errorId} className="mb-3">
            <Alert tone="error" title="Invalid reviewer token">
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="reviewer-token" className="mb-1 block text-xs font-medium text-muted">
            Reviewer token
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="reviewer-token"
              // Password-typed keeps browsers from auto-completing it into a shared field,
              // hides it from casual over-the-shoulder viewing, and stops screen recorders
              // from surfacing it in a search.
              type={revealed ? 'text' : 'password'}
              name="reviewer-token"
              autoComplete="off"
              spellCheck={false}
              // Password managers should still be able to save this if the reviewer
              // opts in, but the field is not filled from the browser's autofill store.
              autoCapitalize="off"
              autoCorrect="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? errorId : undefined}
              disabled={busy}
              className={cn(
                'w-full rounded-lg border border-line px-3 py-2.5 pr-11 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/15',
                busy && 'opacity-60',
              )}
            />
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? 'Hide token' : 'Show token'}
              aria-pressed={revealed}
              disabled={busy}
              className="absolute inset-y-0 right-2 grid place-items-center rounded-md px-1.5 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            >
              {revealed ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Your session is secure and will end when you close this tab.
          </p>

          <div className="mt-5 flex justify-end">
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!value.trim()}>
              Sign in
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
