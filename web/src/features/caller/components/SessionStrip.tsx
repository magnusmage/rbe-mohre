import { LabeledValue } from '@/components/ui';
import { SESSION } from '@/data/mock';

/** Compact verified-session details under the call hero. */
export function SessionStrip() {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-line bg-white px-4 py-3 md:grid-cols-4">
      <LabeledValue label="Worker" value={SESSION.workerId} mono />
      <LabeledValue label="Case" value={SESSION.caseRef} mono />
      <LabeledValue label="Employer" value={SESSION.employer} />
      <LabeledValue label="Contract wage" value={SESSION.contractWage} mono />
    </div>
  );
}
