import { Kbd, SectionLabel } from '@/components/ui';

export function RightsCard() {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <SectionLabel className="mb-2">Your rights this call</SectionLabel>
      <ul className="m-0 list-none p-0 text-[13px] leading-[1.6]">
        <li className="border-b border-line-soft py-[5px]">
          Say <Kbd>human</Kbd> or <Kbd>stop</Kbd> — you're transferred immediately.
        </li>
        <li className="border-b border-line-soft py-[5px]">
          Nothing is filed until <strong>you confirm</strong> a draft.
        </li>
        <li className="py-[5px]">A specialist reviews every case — the AI does not decide.</li>
      </ul>
    </div>
  );
}
