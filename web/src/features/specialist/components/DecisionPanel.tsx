import { useEffect, useState } from 'react';
import { CheckCircleIcon } from '@/components/icons';
import { Alert, Button, Card, CardHeader } from '@/components/ui';
import { DECISION_OPTIONS, SPECIALIST } from '@/data/mock';
import {
  fetchReviewCase,
  selectDecisionSubmission,
  submitDecision,
  submissionErrorDismissed,
} from '@/features/specialist/state/caseSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cn } from '@/lib/cn';
import { DECISION_CODE } from '@/services/review/reviewApi';
import type { DecisionKey } from '@/types';

interface DecisionPanelProps {
  /** The case the decision belongs to; sent as `review_ref` in the request. */
  reviewRef: string;
  /** True while the transcript hasn't been HMAC-stored yet. */
  locked: boolean;
  /** Backend-recorded decision code from `review.decision` — non-null means already decided. */
  recordedDecision?: string | null;
  /** Who recorded the decision, if any. */
  decidedBy?: string | null;
  /** Local timestamp string for the recorded decision. */
  decidedAt?: string;
}

/** Map a backend decision code back to its display option. */
function optionFromCode(code: string | null | undefined) {
  if (!code) return null;
  return DECISION_OPTIONS.find((o) => DECISION_CODE[o.key] === code) ?? null;
}

export function DecisionPanel({
  reviewRef,
  locked,
  recordedDecision = null,
  decidedBy = null,
  decidedAt = '',
}: DecisionPanelProps) {
  const dispatch = useAppDispatch();
  const submission = useAppSelector(selectDecisionSubmission);
  const ownsSubmission = submission.reviewRef === reviewRef;

  const [selected, setSelected] = useState<DecisionKey | null>(null);
  const [note, setNote] = useState('');

  // Reset local form whenever the case changes.
  useEffect(() => {
    setSelected(null);
    setNote('');
  }, [reviewRef]);

  // After a successful POST, pull the latest case so `review.decision` (and
  // everything else) reflects the update. The refetch is silent — the slice
  // keeps the current data visible while the request runs.
  useEffect(() => {
    if (ownsSubmission && submission.status === 'succeeded') {
      dispatch(fetchReviewCase(reviewRef));
    }
  }, [ownsSubmission, submission.status, reviewRef, dispatch]);

  const alreadyDecided = Boolean(recordedDecision);
  const submitting = ownsSubmission && submission.status === 'submitting';
  const justRecorded = ownsSubmission && submission.status === 'succeeded';
  const failed = ownsSubmission && submission.status === 'failed';
  // Whole panel is disabled if: transcript pending, decision already on record,
  // OR a submit is currently in flight.
  const disabled = locked || alreadyDecided || submitting;

  const option = DECISION_OPTIONS.find((o) => o.key === selected);
  // If the server already carries a decision, surface THAT option in the UI.
  const shownOption = alreadyDecided ? optionFromCode(recordedDecision) : option;

  // Required only in the sense that a decision must be picked; note is optional.
  const canConfirm = !!option && !disabled;

  function onConfirm() {
    if (!option) return;
    dispatch(
      submitDecision({
        reviewRef,
        body: { decision: DECISION_CODE[option.key], reviewer: SPECIALIST.name },
      }),
    );
  }

  function onCancel() {
    setSelected(null);
    setNote('');
    if (failed) dispatch(submissionErrorDismissed());
  }

  // The note + status area is shown whenever there's a decision to reason about:
  // a locally-picked one, or a server-recorded one. Once recorded, the field
  // stays visible (disabled) so the specialist can still read what was written.
  const showForm = !!shownOption;

  const recordedByLabel = decidedBy ?? SPECIALIST.name;
  const recordedTimeLabel = decidedAt;

  return (
    <Card tone="dark" radius="md" className="mb-8">
      <CardHeader
        tone="dark"
        icon={<CheckCircleIcon size={16} color="#fff" />}
        title="Specialist decision"
        aside={
          <span className="text-[11.5px] text-[#9AA7B4]">
            {alreadyDecided ? 'Decision recorded · one per case' : 'Decided once · every tier reaches a human'}
          </span>
        }
      />
      <div className="p-4">
        <div
          role="radiogroup"
          aria-label="Decision"
          aria-required="true"
          className={cn('mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4', locked && 'opacity-40')}
        >
          {DECISION_OPTIONS.map((opt) => {
            const active =
              selected === opt.key || (alreadyDecided && shownOption?.key === opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setSelected(opt.key)}
                style={active ? { borderColor: opt.color } : undefined}
                className={cn(
                  'rounded-lg px-3.5 py-3 text-left transition-colors disabled:cursor-default',
                  active ? 'border-2 bg-brand-25' : 'border border-line bg-white enabled:hover:bg-surface-alt',
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="mono text-[10.5px] text-muted">{opt.index}</span>
                  <span className="text-[13px] font-semibold">{opt.title}</span>
                </div>
                <div className="text-[11.5px] leading-[1.4] text-muted">{opt.description}</div>
              </button>
            );
          })}
        </div>

        {showForm && shownOption && (
          <div className="border-t border-line-soft pt-3.5">
            <label htmlFor="decision-note" className="mb-1.5 block text-[12.5px] text-muted">
              Note to record (audited, visible to the worker)
            </label>
            <textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Reason for ${shownOption.label} — optional context.`}
              disabled={submitting || justRecorded || alreadyDecided}
              className="min-h-[70px] w-full resize-y rounded-md border border-line px-3 py-2.5 text-[13px] outline-none focus:border-brand disabled:bg-surface-alt"
            />

            {failed && submission.error && (
              <div className="mt-3">
                <Alert title="Couldn't record decision" onDismiss={() => dispatch(submissionErrorDismissed())}>
                  {submission.error}
                </Alert>
              </div>
            )}

            {alreadyDecided ? (
              <div role="status" className="mt-3 flex items-center gap-2 text-[13px]">
                <CheckCircleIcon size={16} color={shownOption.color} />
                <span>
                  Decision recorded: <strong>{shownOption.label}</strong> · signed by {recordedByLabel}
                  {recordedTimeLabel ? ` · ${recordedTimeLabel}` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <div className="text-xs text-muted">
                  Signed by <strong className="text-ink">{SPECIALIST.name}</strong> · specialist token · auth verified
                </div>
                <div className="flex-1" />
                <Button size="sm" onClick={onCancel} disabled={submitting || justRecorded}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="border-0 px-[18px] font-semibold text-white hover:opacity-90"
                  style={{ background: shownOption.color }}
                  disabled={!canConfirm}
                  onClick={onConfirm}
                >
                  {submitting ? 'Recording…' : justRecorded ? 'Recorded' : `Confirm: ${shownOption.label}`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
