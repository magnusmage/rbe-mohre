import type { ReactNode } from 'react';

/** Main content + sticky 400px right rail; stacks on smaller screens. */
export function TwoColumnLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">{main}</div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-20">{rail}</div>
    </div>
  );
}
