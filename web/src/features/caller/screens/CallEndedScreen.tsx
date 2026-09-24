import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { CheckIcon, CopyIcon } from '@/components/icons';
import { TranscriptPanel } from '@/components/transcript/Transcript';
import { Badge, Button, LabeledValue, Orb, SectionLabel } from '@/components/ui';
import { SESSION, TRANSCRIPT } from '@/data/mock';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { formatDuration } from '@/lib/time';
import { useAppSelector } from '@/store/hooks';
import { selectCallDurationSeconds } from '../state/callSessionSlice';
import { BackButton } from '../components/BackButton';
import { TwoColumnLayout } from '../components/TwoColumnLayout';

const NEXT_STEPS = [
  {
    title: 'Transcript stored',
    body: "HMAC-verified transcript arrives within ~2 minutes and unlocks the specialist's decision.",
  },
  {
    title: 'Specialist reviews',
    body: 'Verified facts, your statement and transcript reviewed side-by-side. Decision made once.',
  },
  {
    title: "You'll hear back",
    body: 'SMS notification with the outcome — uphold, open complaint, refer or request more evidence.',
  },
];

function ReferenceCard() {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-3.5 rounded-xl border border-line bg-white px-5 py-3.5 shadow-[0_2px_8px_rgba(20,32,43,.06)]">
      <div className="text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-muted">Your reference</div>
        <div className="mono text-[22px] font-semibold tracking-[-.01em]">{SESSION.reviewRef}</div>
      </div>
      <div className="hidden h-9 w-px bg-line-soft sm:block" />
      <div className="text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-muted">Review tier</div>
        <div className="mt-0.5">
          <Badge tone="danger" size="md">
            TIER 2 · MANDATORY QUALIFIED
          </Badge>
        </div>
      </div>
      <Button variant="muted" className="px-3 py-2 text-[12.5px]" size="sm" onClick={() => copy(SESSION.reviewRef)}>
        {copied ? <CheckIcon size={14} color="#067647" /> : <CopyIcon size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function NextSteps() {
  return (
    <div className="mt-7 rounded-xl border border-line-soft bg-white px-5 py-[18px] text-left">
      <SectionLabel className="mb-3 text-[12.5px]">What happens next</SectionLabel>
      <ol className="grid gap-4 md:grid-cols-3">
        {NEXT_STEPS.map((step, i) => (
          <li key={step.title}>
            <div className="mb-1 flex items-center gap-2">
              <span className="grid size-[22px] place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <span className="text-[13.5px] font-semibold">{step.title}</span>
            </div>
            <div className="text-[12.5px] leading-normal text-muted">{step.body}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CallEndedScreen() {
  const navigate = useNavigate();
  const durationSeconds = useAppSelector(selectCallDurationSeconds);
  // Falls back to the sample duration when this screen is opened without a finished call.
  const duration = durationSeconds === null ? SESSION.callDuration : formatDuration(durationSeconds);

  return (
    <>
      <BackButton to={ROUTES.callerReady} />
      <TwoColumnLayout
        main={
          <>
            <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-linear-to-b from-brand-25 to-white px-5 py-9 text-center sm:px-9">
              <Orb size="med" state="ended" className="mx-auto mb-5">
                <CheckIcon size={56} color="#fff" strokeWidth={2.6} />
              </Orb>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-[.14em] text-success">
                Call ended · <span className="mono">{duration}</span> · {SESSION.toolCalls} tool calls
              </div>
              <h1 className="mb-1.5 text-[26px] font-semibold tracking-[-.01em]">Thank you — your case is with a specialist</h1>
              <p className="mx-auto mb-6 max-w-[52ch] text-sm leading-[1.55] text-muted">
                A qualified specialist will review the verified facts, your statement and the full transcript. You'll be
                contacted on the number registered against <span className="mono text-ink">{SESSION.workerId}</span>.
              </p>

              <ReferenceCard />
              <NextSteps />

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Button variant="dark">Track my case</Button>
                <Button variant="secondary">Download transcript (PDF)</Button>
                <Button variant="secondary" onClick={() => navigate(ROUTES.callerReady)}>
                  New call
                </Button>
              </div>
            </section>

            <div className="rounded-xl border border-line bg-white px-5 py-4">
              <SectionLabel className="mb-3">Call summary</SectionLabel>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <LabeledValue variant="plain" label="Duration" value={duration} mono />
                <LabeledValue variant="plain" label="Language" value="English" />
                <LabeledValue variant="plain" label="Verified facts" value="2" mono />
                <LabeledValue variant="plain" label="Allegations" value="1" mono />
              </div>
            </div>
          </>
        }
        rail={
          <TranscriptPanel
            title="Transcript"
            aside={
              <Badge tone="success" size="xs" className="font-semibold tracking-normal">
                HMAC OK
              </Badge>
            }
            entries={TRANSCRIPT}
            className="max-h-[720px]"
          />
        }
      />
    </>
  );
}
