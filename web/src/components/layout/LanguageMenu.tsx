import { useCallback, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, GlobeIcon } from '@/components/icons';
import { useLanguage } from '@/context/LanguageContext';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';

export function LanguageMenu() {
  const { language, languages, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white py-1.5 pl-3 pr-2.5 text-[13px] font-medium text-ink hover:bg-surface-alt"
      >
        <GlobeIcon size={14} />
        <span className="hidden sm:inline">{language.name}</span>
        <ChevronDownIcon size={12} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Interface language"
          className="absolute right-0 top-[38px] z-30 min-w-[180px] rounded-[10px] border border-line bg-white p-1 shadow-[0_8px_24px_-6px_rgba(20,32,43,.18)]"
        >
          {languages.map((lang) => {
            const active = lang.code === language.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLanguage(lang.code);
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-[9px] text-[13.5px] text-ink hover:bg-surface-alt',
                  active ? 'bg-surface-alt font-semibold' : 'font-medium',
                )}
              >
                <span className="flex-1 text-left">{lang.name}</span>
                <span className="text-[11.5px] text-muted">{lang.native}</span>
                {active && <CheckIcon size={14} color="#0B7568" className="ml-1.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
