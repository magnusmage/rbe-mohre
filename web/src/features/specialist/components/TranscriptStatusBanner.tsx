import { CheckIcon, LockIcon } from '@/components/icons';

interface TranscriptStatusBannerProps {
  pending: boolean;
  storedAt: string;
}

/** Explains whether the decision is locked (transcript pending) or ready. */
export function TranscriptStatusBanner({ pending, storedAt }: TranscriptStatusBannerProps) {
  if (pending) {
    return (
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-l-4 border-warn-line border-l-warn bg-warn-50 px-4 py-3"
      >
        <LockIcon size={18} color="#A8650E" />
        <div className="flex-1 text-[13.5px] text-warn-deep">
          <strong>Decision locked.</strong> Waiting on HMAC-verified transcript. Buttons unlock automatically once the
          transcript is stored.
        </div>
        <span className="mono text-[11.5px] text-warn-ink">409 transcript_pending</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-l-4 border-brand-100 border-l-success bg-brand-50 px-4 py-2.5"
    >
      <CheckIcon size={16} color="#067647" />
      <div className="flex-1 text-[13px] text-brand-dark">
        <strong>Ready to decide.</strong> Transcript verified &amp; stored · HMAC ok · timestamp within window. This item
        may be decided once.
      </div>
      <span className="mono text-[11.5px] text-success">stored {storedAt}</span>
    </div>
  );
}
