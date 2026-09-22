import { useState, type FormEvent } from 'react';
import { CheckIcon, PhoneIcon } from '@/components/icons';
import { Alert, Button, Kbd, Orb, Spinner, TextField } from '@/components/ui';
import { SESSION, SPOKEN_LANGUAGES } from '@/data/mock';
import { cn } from '@/lib/cn';
import type { LanguageCode } from '@/types';
import { useStartCall } from '../hooks/useStartCall';

const READINESS_CHECKS = ['Microphone ready', 'Secure connection', 'End-to-end encrypted'];

export function ReadyScreen() {
  const { start, isStarting, showProgress, progressLabel, error, dismissError } = useStartCall();
  const [form, setForm] = useState({ workerId: SESSION.workerId, caseRef: SESSION.caseRef, pin: SESSION.pin });
  const [spokenLanguage, setSpokenLanguage] = useState<LanguageCode>('en');

  const update = (field: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isStarting) void start();
  };

  return (
    <form
      onSubmit={handleSubmit}
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

      {/* Inputs are locked while the call is being set up. */}
      <fieldset disabled={showProgress} className="m-0 min-w-0 border-0 p-0">
        <div className="mb-5 grid grid-cols-1 gap-x-3.5 gap-y-3 text-left sm:grid-cols-2">
          <TextField
            label="Worker ID"
            mono
            containerClassName="sm:col-span-2"
            value={form.workerId}
            onChange={(e) => update('workerId')(e.target.value)}
            required
          />
          <TextField
            label="Case reference"
            mono
            value={form.caseRef}
            onChange={(e) => update('caseRef')(e.target.value)}
            required
          />
          <TextField
            label="One-time PIN (SMS)"
            mono
            inputMode="numeric"
            autoComplete="one-time-code"
            value={form.pin}
            onChange={(e) => update('pin')(e.target.value)}
            required
          />
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Speak in">
          <span className="mr-1 self-center text-xs text-muted">Speak in:</span>
          {SPOKEN_LANGUAGES.map((lang) => {
            const active = lang.code === spokenLanguage;
            return (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSpokenLanguage(lang.code)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12.5px]',
                  active ? 'bg-ink font-semibold text-white' : 'border border-line bg-white font-medium text-ink hover:bg-surface-alt',
                )}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </fieldset>

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

      <Button type="submit" variant="primary" size="xl" className="gap-3" loading={isStarting}>
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
    </form>
  );
}
