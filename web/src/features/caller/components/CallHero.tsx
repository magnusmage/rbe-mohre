import { CheckIcon, MicIcon, MicOffIcon, PhoneOffIcon, UserIcon } from '@/components/icons';
import { Button, Orb, Waveform } from '@/components/ui';
import { SESSION } from '@/data/mock';

interface CallHeroProps {
  muted: boolean;
  /** Current agent turn; `null` when no live session backs this screen. */
  agentMode: 'speaking' | 'listening' | null;
  /** Disables call controls while an action (e.g. ending) is in progress. */
  busy?: boolean;
  onToggleMute: () => void;
  onTransfer: () => void;
  onEndCall: () => void;
}

const STATUS_LABEL = { speaking: 'Agent speaking', listening: 'Listening' } as const;

/** Dark live-call panel: recording status, orb, timer, current agent line and call controls. */
export function CallHero({ muted, agentMode, busy = false, onToggleMute, onTransfer, onEndCall }: CallHeroProps) {
  return (
    <section
      aria-label="Live call"
      className="relative overflow-hidden rounded-2xl bg-linear-to-b from-night to-ink px-5 pb-7 pt-9 text-white shadow-[0_12px_40px_-12px_rgba(11,117,104,.45)] sm:px-8"
    >
      <div className="bg-dots pointer-events-none absolute inset-0" />

      <div className="relative mb-6 flex flex-wrap items-center gap-2.5">
        <span className="inline-block size-2 animate-pulse-rec rounded-full bg-danger" />
        <span className="text-[11px] font-bold uppercase tracking-[.1em] text-[#F0A79E]">Recording · Live</span>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-3 py-[5px] text-xs text-[#B8C8CE]">
          <CheckIcon size={12} color="#5CC4AE" />
          Verified · bound to{' '}
          <span className="mono text-white">
            {SESSION.workerId} · {SESSION.caseRef}
          </span>
        </div>
      </div>

      <div className="relative grid items-center gap-8 md:grid-cols-[220px_1fr]">
        <Orb state="live" className="mx-auto md:mx-0">
          <Waveform paused={muted || agentMode === 'listening'} />
        </Orb>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-[.1em] text-[#9AC5BC]">
            {muted ? 'Microphone muted' : STATUS_LABEL[agentMode ?? 'speaking']}
          </div>
          <div className="mono mb-2.5 text-[56px] font-medium leading-none tracking-[-.02em]">{SESSION.liveTimer}</div>
          <div className="max-w-[44ch] text-[15px] leading-normal text-[#C8D6E2]">
            "I've recorded your statement separately from the WPS record. I won't say who's right — a specialist will
            look at both."
          </div>
        </div>
      </div>

      <div className="relative mt-8 flex flex-col gap-3 border-t border-white/8 pt-6 sm:flex-row">
        <Button variant="glass" size="lg" className="flex-1" aria-pressed={muted} disabled={busy} onClick={onToggleMute}>
          {muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
          {muted ? 'Unmute microphone' : 'Mute microphone'}
        </Button>
        <Button variant="glass" size="lg" className="flex-1" disabled={busy} onClick={onTransfer}>
          <UserIcon size={18} />
          Transfer to human
        </Button>
        <Button variant="danger" size="lg" className="flex-1" loading={busy} onClick={onEndCall}>
          <PhoneOffIcon size={18} />
          End call
        </Button>
      </div>
    </section>
  );
}
