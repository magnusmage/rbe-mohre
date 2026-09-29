import { CheckIcon, PhoneIcon } from '@/components/icons';
import { Alert, Button, Kbd, Orb, Spinner } from '@/components/ui';
import { useStartCall } from '../hooks/useStartCall';

const READINESS_CHECKS = ['Microphone ready', 'Secure connection', 'End-to-end encrypted'];

export function ReadyScreen() {
  const { start, isStarting, showProgress, progressLabel, error, dismissError } = useStartCall();

  const handleSubmit = () => {
    if (!isStarting) void start();
  };

  return (
    <div
      aria-busy={showProgress}
      className="mx-auto max-w-[720px] rounded-2xl border border-line bg-white px-5 py-10 text-center shadow-[0_2px_12px_rgba(20,32,43,.05)] sm:px-14 sm:py-12"
    >
      <Orb state="idle" className="mx-auto mb-7 h-[140px] w-[140px]">
        <PhoneIcon size={72} color="#fff" strokeWidth={1.8} />
      </Orb>

      <div className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-brand">MoHRE Rights Assistant · 80084</div>
      <h1 className="mb-2 text-[26px] font-semibold tracking-[-.015em] sm:text-[30px]">Start a voice call about your case</h1>
      <p className="mx-auto mb-7 max-w-[52ch] text-[15px] leading-[1.55] text-muted">
        Your call is checked against your own contract, WPS record and the rule in force for that month. Every call goes
        to a qualified specialist — the assistant never decides.
      </p>

      {error && (
        <Alert title={error.title} onDismiss={dismissError} className="mx-auto mb-5 max-w-[520px]">
          {error.message}
          {error.link && (
            <>
              {' '}
              <a
                href={error.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand underline underline-offset-2 hover:text-brand-dark"
              >
                {error.link.label}
              </a>
            </>
          )}
        </Alert>
      )}

      <Button variant="primary" size="xl" className="gap-3" loading={isStarting} onClick={handleSubmit}>
        {showProgress ? <Spinner size={18} /> : <PhoneIcon size={20} color="#fff" />}
        {progressLabel ?? (error ? 'Try again' : 'Start call')}
      </Button>
      <div className="sr-only" aria-live="polite">
        {progressLabel ?? ''}
      </div>

      <div className="mt-5 text-[12.5px] leading-[1.55] text-muted">
        By pressing Start you agree to be recorded. This is{' '}
        <strong className="text-ink">information, not legal advice</strong>. Say <Kbd>human</Kbd> or <Kbd>stop</Kbd>{' '}
        at any time to transfer to a specialist.
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-4 border-t border-dashed border-line pt-5 text-[12.5px] text-muted">
        {READINESS_CHECKS.map((check) => (
          <span key={check} className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} color="#067647" />
            {check}
          </span>
        ))}
      </div>
    </div>
  );
}
